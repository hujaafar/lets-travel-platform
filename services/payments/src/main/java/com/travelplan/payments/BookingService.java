package com.travelplan.payments;

import com.travelplan.common.SessionUser;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BookingService {
  private final JdbcTemplate db;
  private final CheckoutGateway gateway;

  public BookingService(JdbcTemplate db, CheckoutGateway gateway) {
    this.db = db;
    this.gateway = gateway;
  }

  static void cutoff(LocalDate departure, Instant now) {
    if (!now.isBefore(departure.minusDays(3).atStartOfDay(ZoneOffset.UTC).toInstant()))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "Bookings and cancellations close three days before departure (00:00 UTC)");
  }

  @Transactional
  public UUID reserve(UUID trip, String provider, SessionUser user) {
    if (!Set.of("STRIPE", "PAYPAL").contains(provider))
      throw new IllegalArgumentException("Choose Stripe or PayPal");
    if (!gateway.configured(provider))
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "This sandbox payment method is not configured");
    var trips = db.queryForList("select * from travel.travels where id=? for update", trip);
    if (trips.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Trip not found");
    var t = trips.get(0);
    var start = ((java.sql.Date) t.get("start_date")).toLocalDate();
    cutoff(start, Instant.now().plusSeconds(3600));
    if (!"PUBLISHED".equals(t.get("status")))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "This trip is not open for booking");
    if (new BigDecimal(t.get("price").toString()).signum() <= 0)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "The manager needs to set a price before checkout");
    if (db.queryForObject(
            "select count(*) from payments.gateways where provider=? and currency=? and enabled",
            Integer.class,
            provider,
            t.get("currency"))
        == 0)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "This payment method is not enabled for the trip currency");
    UUID userId = UUID.fromString(user.id());
    var existing =
        db.queryForList(
            "select id,provider from payments.bookings where user_id=? and travel_id=? and status"
                + " in ('PENDING','CONFIRMED','CANCEL_REQUESTED')",
            userId,
            trip);
    if (!existing.isEmpty()) {
      if (!provider.equals(existing.get(0).get("provider")))
        throw new ResponseStatusException(
            HttpStatus.CONFLICT, "Cancel your existing booking before changing payment method");
      return (UUID) existing.get(0).get("id");
    }
    if (db.queryForObject(
            "select count(*) from payments.bookings where travel_id=? and status in"
                + " ('PENDING','CONFIRMED','CANCEL_REQUESTED')",
            Integer.class,
            trip)
        >= (int) t.get("capacity"))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "This trip is fully booked");
    UUID id = UUID.randomUUID();
    db.update(
        "insert into"
            + " payments.bookings(id,user_id,travel_id,provider,amount,currency,status,expires_at)"
            + " values (?,?,?,?,?,?,'PENDING',now()+interval '60 minutes')",
        id,
        userId,
        trip,
        provider,
        t.get("price"),
        t.get("currency"));
    return id;
  }

  @Transactional
  public void cancel(UUID id, SessionUser user) {
    var rows =
        db.queryForList(
            "select b.*,t.manager_id,t.start_date from payments.bookings b join travel.travels t on"
                + " t.id=b.travel_id where b.id=? for update of b",
            id);
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found");
    var b = rows.get(0);
    if (!"ADMIN".equals(user.role())
        && !user.id().equals(b.get("user_id").toString())
        && !("TRAVEL_MANAGER".equals(user.role())
            && UUID.fromString(user.id()).equals(b.get("manager_id"))))
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "This booking is not yours to manage");
    if (Set.of("CANCELLED", "REFUNDED", "CANCEL_REQUESTED").contains(b.get("status"))) return;
    cutoff(((java.sql.Date) b.get("start_date")).toLocalDate(), Instant.now());
    db.update(
        "update payments.bookings set status='CANCEL_REQUESTED',updated_at=now() where id=?", id);
  }

  @Transactional
  public void process(UUID id) {
    var rows = db.queryForList("select * from payments.bookings where id=? for update", id);
    if (rows.isEmpty()) return;
    var b = rows.get(0);
    String state = b.get("status").toString();
    if (!Set.of("PENDING", "CANCEL_REQUESTED").contains(state)) return;
    boolean expired =
        ((java.sql.Timestamp) b.get("expires_at")).toInstant().isBefore(Instant.now());
    boolean cancel = "CANCEL_REQUESTED".equals(state) || expired;
    if (b.get("provider_id") == null) {
      // The stable ID and stored expiry make retries identical after a crash.
      var hosted = gateway.create(b);
      db.update(
          "update payments.bookings set provider_id=?,checkout_url=?,updated_at=now() where id=?",
          hosted.id(),
          hosted.url(),
          id);
      b.put("provider_id", hosted.id());
      b.put("checkout_url", hosted.url());
    }
    var result = gateway.inspect(b, !cancel);
    if (cancel) {
      if (!result.paid() && !result.expired() && "STRIPE".equals(b.get("provider"))) {
        gateway.expire(b);
        result = gateway.inspect(b, false);
      }
      if (result.paid()) {
        String refund = Objects.toString(b.get("refund_id"), "");
        if (refund.isBlank()) {
          refund = gateway.refund(b, result.capture());
          db.update(
              "update payments.bookings set refund_id=?,status='CANCEL_REQUESTED' where id=?",
              refund,
              id);
        }
        if (!gateway.refunded(b, refund)) return;
      }
      db.update(
          "delete from travel.participants where travel_id=? and user_id=?",
          b.get("travel_id"),
          b.get("user_id"));
      db.update(
          "update payments.bookings set status=?,updated_at=now() where id=?",
          result.paid() ? "REFUNDED" : "CANCELLED",
          id);
    } else if (result.paid()) {
      db.update(
          "update payments.bookings set status='CONFIRMED',capture_id=?,updated_at=now() where"
              + " id=?",
          result.capture(),
          id);
      db.update(
          "insert into travel.participants(travel_id,user_id) values (?,?) on conflict do nothing",
          b.get("travel_id"),
          b.get("user_id"));
    } else if (result.expired())
      db.update("update payments.bookings set status='CANCELLED',updated_at=now() where id=?", id);
  }
}
