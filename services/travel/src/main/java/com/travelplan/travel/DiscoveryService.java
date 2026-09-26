package com.travelplan.travel;

import java.time.Duration;
import java.util.*;
import org.neo4j.driver.Driver;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/** PostgreSQL outbox -> Elasticsearch and Neo4j; idempotent across process crashes. */
@Service
public class DiscoveryService {
  private final JdbcTemplate db;
  private final Driver graph;
  private final RestClient elastic;
  private static final org.slf4j.Logger log =
      org.slf4j.LoggerFactory.getLogger(DiscoveryService.class);

  public DiscoveryService(
      JdbcTemplate db,
      Driver graph,
      @Value("${ELASTIC_URL:https://elasticsearch:9200}") String url,
      @Value("${ELASTIC_PASSWORD:}") String password,
      @Value("${ELASTIC_USERNAME:travel-indexer}") String username) {
    this.db = db;
    this.graph = graph;
    var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofSeconds(3));
    factory.setReadTimeout(Duration.ofSeconds(5));
    elastic =
        RestClient.builder()
            .baseUrl(url)
            .requestFactory(factory)
            .defaultHeaders(h -> h.setBasicAuth(username, password))
            .build();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> hits(String q, int size) {
    try {
      var body =
          Map.of(
              "size",
              size,
              "query",
              Map.of(
                  "multi_match",
                  Map.of(
                      "query",
                      q,
                      "type",
                      "bool_prefix",
                      "fields",
                      List.of("text", "text._2gram", "text._3gram"))));
      Map<String, Object> response =
          elastic.post().uri("/journeys/_search").body(body).retrieve().body(Map.class);
      return (List<Map<String, Object>>) ((Map<?, ?>) response.get("hits")).get("hits");
    } catch (Exception e) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "Search is catching up. Browse the collection or retry shortly.");
    }
  }

  public List<String> search(String q) {
    return hits(q, 200).stream().map(h -> h.get("_id").toString()).toList();
  }

  public List<String> suggest(String q) {
    return hits(q, 6).stream()
        .map(h -> ((Map<?, ?>) h.get("_source")).get("title").toString())
        .distinct()
        .toList();
  }

  @Scheduled(fixedDelay = 7000)
  @Transactional
  public void project() {
    if (!Boolean.TRUE.equals(
        db.queryForObject("select pg_try_advisory_xact_lock(9147003)", Boolean.class))) return;
    var events =
        db.queryForList(
            "select id,travel_id from travel.search_outbox order by id limit 30 for update skip"
                + " locked");
    if (events.isEmpty()) return;
    try {
      boolean exists =
          Boolean.TRUE.equals(
              elastic
                  .head()
                  .uri("/journeys")
                  .exchange((request, response) -> response.getStatusCode().is2xxSuccessful()));
      if (!exists)
        elastic
            .put()
            .uri("/journeys")
            .body(
                Map.of(
                    "settings",
                    Map.of("number_of_shards", 1, "number_of_replicas", 0),
                    "mappings",
                    Map.of(
                        "properties",
                        Map.of(
                            "text",
                            Map.of("type", "search_as_you_type"),
                            "title",
                            Map.of("type", "keyword")))))
            .retrieve()
            .toBodilessEntity();
      for (var event : events) {
        var id = event.get("travel_id");
        var rows = db.queryForList("select * from travel.travels where id=?", id);
        var stops =
            db.queryForList(
                "select country,activities,transportation from travel.stops where travel_id=?", id);
        try (var session = graph.session()) {
          session.executeWrite(
              tx -> {
                tx.run("MATCH (t:Offering {id:$id}) DETACH DELETE t", Map.of("id", id.toString()))
                    .consume();
                if (!rows.isEmpty()) {
                  var row = rows.get(0);
                  var fields = new ArrayList<String>();
                  for (var stop : stops)
                    for (String key : List.of("country", "activities", "transportation"))
                      for (String word :
                          stop.get(key).toString().toLowerCase(Locale.ROOT).split("[,;\\n]"))
                        if (!word.isBlank()) fields.add(key + ":" + word.trim());
                  tx.run(
                          "CREATE (t:Offering {id:$id,title:$title,fields:$fields,ends:$ends})",
                          Map.of(
                              "id",
                              id.toString(),
                              "title",
                              row.get("title"),
                              "fields",
                              fields,
                              "ends",
                              row.get("end_date").toString()))
                      .consume();
                  for (var b :
                      db.queryForList(
                          "select b.user_id,coalesce(f.rating,3) as rating from payments.bookings b"
                              + " left join travel.feedback f on f.travel_id=b.travel_id and"
                              + " f.user_id=b.user_id where b.travel_id=? and b.status='CONFIRMED'",
                          id))
                    tx.run(
                            "MERGE (u:Member {id:$user}) WITH u MATCH(t:Offering{id:$id})"
                                + " MERGE(u)-[r:ATTENDED]->(t) SET r.weight=$weight",
                            Map.of(
                                "user",
                                b.get("user_id").toString(),
                                "id",
                                id.toString(),
                                "weight",
                                b.get("rating")))
                        .consume();
                }
                tx.run("MATCH(u:Member) WHERE NOT (u)-[:ATTENDED]->() DELETE u").consume();
                return null;
              });
        }
        if (rows.isEmpty() || !"PUBLISHED".equals(rows.get(0).get("status"))) {
          elastic
              .delete()
              .uri("/journeys/_doc/{id}", id)
              .retrieve()
              .onStatus(s -> s.value() == 404, (r, s) -> {})
              .toBodilessEntity();
        } else {
          var row = rows.get(0);
          var destinations =
              db.queryForList(
                  "select destination,country,activities,accommodation,transportation from"
                      + " travel.stops where travel_id=? order by position",
                  id);
          elastic
              .put()
              .uri("/journeys/_doc/{id}", id)
              .body(
                  Map.of(
                      "title",
                      row.get("title"),
                      "text",
                      row.get("title")
                          + " "
                          + Objects.toString(row.get("description"), "")
                          + " "
                          + destinations))
              .retrieve()
              .toBodilessEntity();
        }
        db.update("delete from travel.search_outbox where id=?", event.get("id"));
      }
    } catch (Exception e) {
      log.warn("Discovery projection deferred: {}", e.getClass().getSimpleName());
    }
  }

  public Object recommend(UUID user) {
    try (var session = graph.session()) {
      var ranked =
          session.executeRead(
              tx ->
                  tx.run(
                          "MATCH(u:Member{id:$user})-[r:ATTENDED]->(past:Offering),"
                              + " (candidate:Offering) WHERE date(past.ends)<date() AND NOT"
                              + " (u)-[:ATTENDED]->(candidate) WITH candidate,"
                              + " sum(reduce(score=0.0, field IN candidate.fields | score + CASE"
                              + " WHEN field IN past.fields THEN r.weight/5.0 ELSE 0 END)) AS score"
                              + " WHERE score>0 RETURN candidate.id AS id,score ORDER BY score DESC"
                              + " LIMIT 60",
                          Map.of("user", user.toString()))
                      .list(r -> r.get("id").asString()));
      var rows =
          db.queryForList(
              "select id,title,image,price,currency,start_date,description from travel.travels"
                  + " where status='PUBLISHED' and start_date>current_date+3 order by start_date"
                  + " limit 200");
      if (!ranked.isEmpty()) {
        rows.removeIf(t -> !ranked.contains(t.get("id").toString()));
        rows.sort(Comparator.comparingInt(t -> ranked.indexOf(t.get("id").toString())));
      }
      return Map.of(
          "basis",
          ranked.isEmpty()
              ? "Discover something new"
              : "Based on destinations, activities and transportation from your bookings and"
                    + " ratings",
          "trips",
          rows.stream().limit(6).toList());
    } catch (Exception e) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "Personal recommendations are temporarily unavailable");
    }
  }
}
