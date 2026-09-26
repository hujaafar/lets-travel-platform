package com.travelplan.payments;

import com.travelplan.common.SessionUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class BookingController {
  private final JdbcTemplate db;
  private final BookingService bookings;
  private final CheckoutGateway gateway;
  private static final org.slf4j.Logger log =
      org.slf4j.LoggerFactory.getLogger(BookingController.class);

  public BookingController(JdbcTemplate db, BookingService bookings, CheckoutGateway gateway) {
    this.db = db;
    this.bookings = bookings;
    this.gateway = gateway;
  }

  public record Booking(@NotNull UUID travelId, @NotBlank String provider) {}

  @GetMapping("/api/checkout/methods")
  public Object methods() {
    return db
        .queryForList("select distinct provider,currency from payments.gateways where enabled")
        .stream()
        .filter(r -> gateway.configured(r.get("provider").toString()))
        .toList();
  }

  @GetMapping("/api/bookings")
  public Object list(@RequestAttribute("user") SessionUser user) {
    return db.queryForList(
        "select b.*,t.title,t.start_date,t.end_date,t.image,t.manager_id from payments.bookings b"
            + " join travel.travels t on t.id=b.travel_id where b.user_id=? order by b.created_at"
            + " desc limit 200",
        UUID.fromString(user.id()));
  }

  @PostMapping("/api/bookings")
  @ResponseStatus(HttpStatus.CREATED)
  public Object book(
      @Valid @RequestBody Booking input, @RequestAttribute("user") SessionUser user) {
    UUID id = bookings.reserve(input.travelId(), input.provider(), user);
    safelyProcess(id);
    return read(id, user);
  }

  private Object read(UUID id, SessionUser user) {
    var rows =
        db.queryForList(
            "select * from payments.bookings where id=? and user_id=?",
            id,
            UUID.fromString(user.id()));
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found");
    return rows.get(0);
  }

  @PostMapping("/api/bookings/{id}/verify")
  public Object verify(@PathVariable UUID id, @RequestAttribute("user") SessionUser user) {
    read(id, user);
    safelyProcess(id);
    return read(id, user);
  }

  @PostMapping("/api/bookings/{id}/cancel")
  public Object cancel(@PathVariable UUID id, @RequestAttribute("user") SessionUser user) {
    bookings.cancel(id, user);
    safelyProcess(id);
    return Map.of(
        "message",
        "Cancellation requested. A completed payment will be refunded through its original"
            + " provider.");
  }

  private void safelyProcess(UUID id) {
    try {
      bookings.process(id);
    } catch (Exception e) {
      log.warn("Booking {} awaits provider reconciliation: {}", id, e.getClass().getSimpleName());
    } finally {
      db.update(
          "update payments.bookings set updated_at=now() where id=? and not is_demo and status in"
              + " ('PENDING','CANCEL_REQUESTED')",
          id);
    }
  }

  @Scheduled(fixedDelay = 30000)
  public void reconcile() {
    for (var id :
        db.queryForList(
            "select id from payments.bookings where not is_demo and status in"
                + " ('PENDING','CANCEL_REQUESTED') order by updated_at limit 25",
            UUID.class)) safelyProcess(id);
  }
}
