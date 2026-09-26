package com.travelplan.travel;

import java.util.*;
import org.neo4j.driver.*;
import org.slf4j.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DestinationGraph {
  private final Driver driver;
  private final JdbcTemplate db;
  private static final org.slf4j.Logger log = LoggerFactory.getLogger(DestinationGraph.class);

  public DestinationGraph(JdbcTemplate db, Driver driver) {
    this.db = db;
    this.driver = driver;
  }

  @Scheduled(fixedDelay = 5000)
  @Transactional
  public void project() {
    if (!Boolean.TRUE.equals(
        db.queryForObject("select pg_try_advisory_xact_lock(9147001)", Boolean.class))) return;
    var events =
        db.queryForList(
            "select id,travel_id from travel.graph_outbox order by id limit 50 for update skip"
                + " locked");
    try (var session = driver.session()) {
      for (var event : events) {
        String id = event.get("travel_id").toString();
        var rows =
            db.queryForList("select title from travel.travels where id=?", event.get("travel_id"));
        var stops =
            db.queryForList(
                "select destination,country from travel.stops where travel_id=? order by position",
                event.get("travel_id"));
        session.executeWrite(
            tx -> {
              tx.run("MATCH (t:Travel {id:$id}) DETACH DELETE t", Map.of("id", id)).consume();
              if (!rows.isEmpty()) {
                tx.run(
                        "CREATE (t:Travel {id:$id,title:$title})",
                        Map.of("id", id, "title", rows.get(0).get("title")))
                    .consume();
                int position = 0;
                for (var stop : stops)
                  tx.run(
                          "MERGE (d:Destination {name:$name,country:$country}) WITH d MATCH"
                              + " (t:Travel {id:$id}) CREATE (t)-[:VISITS"
                              + " {position:$position}]->(d)",
                          Map.of(
                              "name",
                              stop.get("destination"),
                              "country",
                              stop.get("country"),
                              "id",
                              id,
                              "position",
                              position++))
                      .consume();
              }
              tx.run("MATCH (d:Destination) WHERE NOT (d)<-[:VISITS]-() DELETE d").consume();
              return null;
            });
        db.update("delete from travel.graph_outbox where id=?", event.get("id"));
      }
    } catch (Exception e) {
      log.warn("Destination projection deferred: {}", e.getClass().getSimpleName());
    }
  }
}
