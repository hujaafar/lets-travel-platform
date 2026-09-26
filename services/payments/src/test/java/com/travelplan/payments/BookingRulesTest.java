package com.travelplan.payments;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.travelplan.common.SessionUser;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class BookingRulesTest {
  final JdbcTemplate db = mock(JdbcTemplate.class);
  final CheckoutGateway gateway = mock(CheckoutGateway.class);
  final BookingService service = new BookingService(db, gateway);
  final UUID trip = UUID.randomUUID(), id = UUID.randomUUID(), userId = UUID.randomUUID();
  final SessionUser traveler =
      new SessionUser(userId.toString(), "Traveler", "t@example.test", "TRAVELER", "csrf");

  Map<String, Object> row(String status) {
    var b = new HashMap<String, Object>();
    b.put("id", id);
    b.put("travel_id", trip);
    b.put("user_id", userId);
    b.put("provider", "STRIPE");
    b.put("provider_id", "cs_test_example");
    b.put("amount", new BigDecimal("12.00"));
    b.put("currency", "USD");
    b.put("status", status);
    b.put("expires_at", java.sql.Timestamp.from(Instant.now().plusSeconds(1800)));
    b.put("start_date", java.sql.Date.valueOf(LocalDate.now().plusDays(10)));
    return b;
  }

  @Test
  void cutoffIsExactUtcBoundary() {
    var date = LocalDate.of(2027, 1, 10);
    assertThatCode(() -> BookingService.cutoff(date, Instant.parse("2027-01-06T23:59:59Z")))
        .doesNotThrowAnyException();
    assertThatThrownBy(() -> BookingService.cutoff(date, Instant.parse("2027-01-07T00:00:00Z")))
        .isInstanceOf(ResponseStatusException.class);
  }

  @Test
  void aReturnUrlAloneCannotConfirmPayment() {
    when(db.queryForList(contains("for update"), eq(id))).thenReturn(List.of(row("PENDING")));
    when(gateway.inspect(anyMap(), eq(true)))
        .thenReturn(new CheckoutGateway.Settlement(false, false, ""));
    service.process(id);
    verify(db, never()).update(startsWith("insert into travel.participants"), any(), any());
    verify(db, never()).update(contains("status='CONFIRMED'"), any(), any());
  }

  @Test
  void paidBookingCreatesMembershipOnlyAfterVerification() {
    when(db.queryForList(contains("for update"), eq(id))).thenReturn(List.of(row("PENDING")));
    when(gateway.inspect(anyMap(), eq(true)))
        .thenReturn(new CheckoutGateway.Settlement(true, false, "pi_1"));
    service.process(id);
    verify(db).update(contains("status='CONFIRMED'"), eq("pi_1"), eq(id));
    verify(db).update(startsWith("insert into travel.participants"), eq(trip), eq(userId));
  }

  @Test
  void paidCancellationRetainsSeatUntilRefundIsConfirmed() {
    var b = row("CANCEL_REQUESTED");
    when(db.queryForList(contains("for update"), eq(id))).thenReturn(List.of(b));
    when(gateway.inspect(anyMap(), eq(false)))
        .thenReturn(new CheckoutGateway.Settlement(true, false, "pi_1"));
    when(gateway.refund(anyMap(), eq("pi_1"))).thenReturn("re_1");
    when(gateway.refunded(anyMap(), eq("re_1"))).thenReturn(false);
    service.process(id);
    verify(db, never()).update(startsWith("delete from travel.participants"), any(), any());
    verify(db).update(contains("refund_id"), eq("re_1"), eq(id));
  }

  @Test
  void persistedRefundIsPolledWithoutIssuingAnotherRefund() {
    var b = row("CANCEL_REQUESTED");
    b.put("refund_id", "re_existing");
    when(db.queryForList(contains("for update"), eq(id))).thenReturn(List.of(b));
    when(gateway.inspect(anyMap(), eq(false)))
        .thenReturn(new CheckoutGateway.Settlement(true, false, "pi_1"));
    when(gateway.refunded(anyMap(), eq("re_existing"))).thenReturn(true);
    service.process(id);
    verify(gateway, never()).refund(anyMap(), anyString());
    verify(db).update(contains("set status=?"), eq("REFUNDED"), eq(id));
  }

  @Test
  void anotherTravelerCannotCancel() {
    var b = row("CONFIRMED");
    b.put("user_id", UUID.randomUUID());
    when(db.queryForList(contains("for update of b"), eq(id))).thenReturn(List.of(b));
    assertThatThrownBy(() -> service.cancel(id, traveler))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("403");
    verify(db, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void soldOutTripDoesNotCreateBooking() {
    when(gateway.configured("STRIPE")).thenReturn(true);
    when(db.queryForList(startsWith("select * from travel.travels"), eq(trip)))
        .thenReturn(
            List.of(
                Map.of(
                    "start_date",
                    java.sql.Date.valueOf(LocalDate.now().plusDays(10)),
                    "status",
                    "PUBLISHED",
                    "price",
                    BigDecimal.TEN,
                    "currency",
                    "USD",
                    "capacity",
                    1)));
    when(db.queryForObject(
            contains("payments.gateways"), eq(Integer.class), eq("STRIPE"), eq("USD")))
        .thenReturn(1);
    when(db.queryForObject(
            contains("count(*) from payments.bookings"), eq(Integer.class), eq(trip)))
        .thenReturn(1);
    assertThatThrownBy(() -> service.reserve(trip, "STRIPE", traveler))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("fully booked");
    verify(db, never()).update(startsWith("insert into payments.bookings"), any(Object[].class));
  }

  @Test
  void mismatchedStripeAmountOrIdentityCannotConfirm() {
    var b = row("PENDING");
    var r =
        new HashMap<String, Object>(
            Map.of("client_reference_id", id.toString(), "currency", "usd", "amount_total", 1200));
    assertThatCode(() -> CheckoutGateway.validateStripe(b, r)).doesNotThrowAnyException();
    r.put("amount_total", 1);
    assertThatThrownBy(() -> CheckoutGateway.validateStripe(b, r))
        .isInstanceOf(IllegalStateException.class);
    r.put("amount_total", 1200);
    r.put("client_reference_id", UUID.randomUUID().toString());
    assertThatThrownBy(() -> CheckoutGateway.validateStripe(b, r))
        .isInstanceOf(IllegalStateException.class);
  }

  @Test
  void mismatchedPayPalCurrencyCannotConfirm() {
    var b = row("PENDING");
    var amount = Map.of("currency_code", "EUR", "value", "12.00");
    assertThatThrownBy(() -> CheckoutGateway.validateAmount(b, amount))
        .isInstanceOf(IllegalStateException.class);
  }
}
