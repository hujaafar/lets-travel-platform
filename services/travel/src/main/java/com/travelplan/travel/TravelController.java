package com.travelplan.travel;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/travels")
public class TravelController {
  private final JdbcTemplate db;

  public TravelController(JdbcTemplate db) {
    this.db = db;
  }

  public record Stop(
      @NotBlank @Size(max = 100) String destination,
      @NotBlank @Size(max = 100) String country,
      @NotBlank @Size(max = 2000) String activities,
      @NotBlank @Size(max = 500) String accommodation,
      @NotBlank @Size(max = 500) String transportation) {}

  public record TravelInput(
      @NotBlank @Size(max = 150) String title,
      @NotNull LocalDate startDate,
      @NotNull LocalDate endDate,
      @NotBlank String status,
      @NotNull @DecimalMin("0.00") @DecimalMax("999999.99") BigDecimal price,
      @Min(1) @Max(10000) int capacity,
      @Size(max = 1000) String description,
      @NotBlank String image,
      @NotEmpty @Size(max = 30) List<@NotNull @Valid Stop> stops,
      @Size(max = 10000) List<UUID> participantIds,
      int version) {}

  public static void validate(TravelInput t) {
    if (t.endDate().isBefore(t.startDate()))
      throw new IllegalArgumentException("End date must be on or after start date");
    if (!Set.of("DRAFT", "PUBLISHED", "ARCHIVED").contains(t.status()))
      throw new IllegalArgumentException("Invalid travel status");
    if (!Set.of("bali", "japan", "dolomites", "morocco", "greece", "iceland").contains(t.image()))
      throw new IllegalArgumentException("Select a destination image");
    if (t.participantIds() != null && t.participantIds().size() > t.capacity())
      throw new IllegalArgumentException("Participants exceed capacity");
  }

  @GetMapping
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public List<Map<String, Object>> list() {
    var rows = db.queryForList("select * from travel.travels order by created_at desc");
    if (rows.isEmpty()) return rows;
    var stopsByTravel = new HashMap<Object, List<Map<String, Object>>>();
    for (var record :
        db.queryForList(
            "select travel_id,destination,country,activities,accommodation,transportation from"
                + " travel.stops order by travel_id,position")) {
      var stop = new HashMap<>(record);
      var travelId = stop.remove("travel_id");
      stopsByTravel.computeIfAbsent(travelId, key -> new ArrayList<>()).add(stop);
    }
    var peopleByTravel = new HashMap<Object, List<UUID>>();
    for (var membership :
        db.queryForList(
            "select travel_id,user_id from travel.participants order by travel_id,user_id"))
      peopleByTravel
          .computeIfAbsent(membership.get("travel_id"), key -> new ArrayList<>())
          .add((UUID) membership.get("user_id"));
    for (var row : rows) {
      row.put("stops", stopsByTravel.getOrDefault(row.get("id"), List.of()));
      row.put("participantIds", peopleByTravel.getOrDefault(row.get("id"), List.of()));
      row.put(
          "duration",
          ChronoUnit.DAYS.between(
                  ((java.sql.Date) row.get("start_date")).toLocalDate(),
                  ((java.sql.Date) row.get("end_date")).toLocalDate())
              + 1);
    }
    return rows;
  }

  @PostMapping
  @Transactional
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@Valid @RequestBody TravelInput t) {
    validate(t);
    UUID id = UUID.randomUUID();
    db.update(
        "insert into"
            + " travel.travels(id,title,start_date,end_date,status,price,capacity,description,image)"
            + " values (?,?,?,?,?,?,?,?,?)",
        id,
        t.title(),
        t.startDate(),
        t.endDate(),
        t.status(),
        t.price(),
        t.capacity(),
        t.description(),
        t.image());
    children(id, t);
    return Map.of("id", id);
  }

  @PutMapping("/{id}")
  @Transactional
  public void update(@PathVariable UUID id, @Valid @RequestBody TravelInput t) {
    validate(t);
    int n =
        db.update(
            "update travel.travels set"
                + " title=?,start_date=?,end_date=?,status=?,price=?,capacity=?,description=?,image=?,version=version+1"
                + " where id=? and version=?",
            t.title(),
            t.startDate(),
            t.endDate(),
            t.status(),
            t.price(),
            t.capacity(),
            t.description(),
            t.image(),
            id,
            t.version());
    if (n == 0)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "This itinerary changed. Refresh before saving.");
    children(id, t);
  }

  private void children(UUID id, TravelInput t) {
    db.update("delete from travel.stops where travel_id=?", id);
    int i = 0;
    for (var s : t.stops())
      db.update(
          "insert into"
              + " travel.stops(travel_id,position,destination,country,activities,accommodation,transportation)"
              + " values (?,?,?,?,?,?,?)",
          id,
          i++,
          s.destination(),
          s.country(),
          s.activities(),
          s.accommodation(),
          s.transportation());
    db.update("delete from travel.participants where travel_id=?", id);
    if (t.participantIds() != null)
      for (UUID uid : new HashSet<>(t.participantIds()))
        db.update("insert into travel.participants(travel_id,user_id) values (?,?)", id, uid);
    db.update("insert into travel.graph_outbox(travel_id) values (?)", id);
  }

  @DeleteMapping("/{id}")
  @Transactional
  public void delete(@PathVariable UUID id) {
    if (db.update("delete from travel.travels where id=?", id) == 0)
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Travel not found");
    db.update("insert into travel.graph_outbox(travel_id) values (?)", id);
  }

  @GetMapping("/graph-status")
  public Map<String, Object> graphStatus() {
    return Map.of(
        "pending", db.queryForObject("select count(*) from travel.graph_outbox", Integer.class));
  }
}
