package com.travelplan.payments;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class CheckoutHttpTest {
  final RestClient.Builder builder = RestClient.builder();
  final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
  final CheckoutGateway gateway =
      new CheckoutGateway(
          "sk_test_fixture", "client", "secret", "https://localhost:8444", builder.build());
  final String id = "12345678-1234-1234-1234-123456789012";

  Map<String, Object> booking(String provider) {
    var b = new HashMap<String, Object>();
    b.put("id", id);
    b.put("provider", provider);
    b.put("provider_id", provider.equals("STRIPE") ? "cs_test_fixture" : "ORDER1");
    b.put("currency", "USD");
    b.put("amount", new BigDecimal("12.00"));
    b.put("expires_at", Timestamp.from(Instant.parse("2027-01-01T12:00:00Z")));
    return b;
  }

  void oauth() {
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v1/oauth2/token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Authorization", "Basic Y2xpZW50OnNlY3JldA=="))
        .andRespond(
            withSuccess("{\"access_token\":\"sandbox-token\"}", MediaType.APPLICATION_JSON));
  }

  String order(String status, boolean captured) {
    return "{\"status\":\""
        + status
        + "\",\"purchase_units\":[{\"custom_id\":\""
        + id
        + "\",\"amount\":{\"currency_code\":\"USD\",\"value\":\"12.00\"}"
        + (captured
            ? ",\"payments\":{\"captures\":[{\"id\":\"CAPTURE1\",\"status\":\"COMPLETED\",\"amount\":{\"currency_code\":\"USD\",\"value\":\"12.00\"}}]}"
            : "")
        + "}]}";
  }

  @Test
  void stripeCreationUsesSnapshotAndStableIdempotency() {
    server
        .expect(requestTo("https://api.stripe.com/v1/checkout/sessions"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Authorization", "Bearer sk_test_fixture"))
        .andExpect(header("Idempotency-Key", "booking-" + id))
        .andExpect(content().string(org.hamcrest.Matchers.containsString("unit_amount%5D=1200")))
        .andRespond(
            withSuccess(
                "{\"id\":\"cs_test_fixture\",\"url\":\"https://checkout.stripe.com/test\"}",
                MediaType.APPLICATION_JSON));
    assertThat(gateway.create(booking("STRIPE")).url())
        .isEqualTo("https://checkout.stripe.com/test");
    server.verify();
  }

  @Test
  void stripePaidStateRequiresMatchingBooking() {
    server
        .expect(requestTo("https://api.stripe.com/v1/checkout/sessions/cs_test_fixture"))
        .andRespond(
            withSuccess(
                "{\"client_reference_id\":\""
                    + id
                    + "\",\"currency\":\"usd\",\"amount_total\":1200,\"payment_status\":\"paid\",\"payment_intent\":\"pi_fixture\"}",
                MediaType.APPLICATION_JSON));
    assertThat(gateway.inspect(booking("STRIPE"), true))
        .isEqualTo(new CheckoutGateway.Settlement(true, false, "pi_fixture"));
    server.verify();
  }

  @Test
  void stripeCancellationExpiresAndRefundUsesStableKey() {
    server
        .expect(requestTo("https://api.stripe.com/v1/checkout/sessions/cs_test_fixture/expire"))
        .andExpect(header("Idempotency-Key", "expire-" + id))
        .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
    server
        .expect(requestTo("https://api.stripe.com/v1/refunds"))
        .andExpect(header("Idempotency-Key", "refund-" + id))
        .andExpect(content().string("payment_intent=pi_fixture"))
        .andRespond(withSuccess("{\"id\":\"re_fixture\"}", MediaType.APPLICATION_JSON));
    server
        .expect(requestTo("https://api.stripe.com/v1/refunds/re_fixture"))
        .andRespond(withSuccess("{\"status\":\"succeeded\"}", MediaType.APPLICATION_JSON));
    var b = booking("STRIPE");
    gateway.expire(b);
    assertThat(gateway.refund(b, "pi_fixture")).isEqualTo("re_fixture");
    assertThat(gateway.refunded(b, "re_fixture")).isTrue();
    server.verify();
  }

  @Test
  void paypalCheckoutStaysInSandboxAndUsesBookingIdentity() {
    oauth();
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v2/checkout/orders"))
        .andExpect(header("PayPal-Request-Id", id))
        .andExpect(header("Authorization", "Bearer sandbox-token"))
        .andExpect(jsonPath("$.purchase_units[0].custom_id").value(id))
        .andExpect(jsonPath("$.purchase_units[0].amount.value").value("12.00"))
        .andRespond(
            withSuccess(
                "{\"id\":\"ORDER1\",\"links\":[{\"rel\":\"payer-action\",\"href\":\"https://www.sandbox.paypal.com/checkoutnow?token=ORDER1\"}]}",
                MediaType.APPLICATION_JSON));
    assertThat(gateway.create(booking("PAYPAL")).id()).isEqualTo("ORDER1");
    server.verify();
  }

  @Test
  void paypalApprovalIsCapturedAndAmountChecked() {
    oauth();
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER1"))
        .andRespond(withSuccess(order("APPROVED", false), MediaType.APPLICATION_JSON));
    oauth();
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER1/capture"))
        .andExpect(header("PayPal-Request-Id", "capture-" + id))
        .andRespond(withSuccess(order("COMPLETED", true), MediaType.APPLICATION_JSON));
    assertThat(gateway.inspect(booking("PAYPAL"), true))
        .isEqualTo(new CheckoutGateway.Settlement(true, false, "CAPTURE1"));
    server.verify();
  }

  @Test
  void cancelledPaypalApprovalNeverCaptures() {
    oauth();
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER1"))
        .andRespond(withSuccess(order("APPROVED", false), MediaType.APPLICATION_JSON));
    assertThat(gateway.inspect(booking("PAYPAL"), false).paid()).isFalse();
    server.verify();
  }

  @Test
  void paypalRefundRemainsPendingUntilCompleted() {
    oauth();
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE1/refund"))
        .andExpect(header("PayPal-Request-Id", "refund-" + id))
        .andRespond(withSuccess("{\"id\":\"REFUND1\"}", MediaType.APPLICATION_JSON));
    oauth();
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v2/payments/refunds/REFUND1"))
        .andRespond(withSuccess("{\"status\":\"PENDING\"}", MediaType.APPLICATION_JSON));
    var b = booking("PAYPAL");
    assertThat(gateway.refund(b, "CAPTURE1")).isEqualTo("REFUND1");
    assertThat(gateway.refunded(b, "REFUND1")).isFalse();
    server.verify();
  }

  @Test
  void emptyProviderBodyFailsClosed() {
    server
        .expect(requestTo("https://api.stripe.com/v1/checkout/sessions/cs_test_fixture"))
        .andRespond(withSuccess("", MediaType.APPLICATION_JSON));
    assertThatThrownBy(() -> gateway.inspect(booking("STRIPE"), true))
        .isInstanceOf(NullPointerException.class);
    server.verify();
  }

  @Test
  void missingOauthTokenFailsBeforeOrderRequest() {
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v1/oauth2/token"))
        .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
    assertThatThrownBy(() -> gateway.create(booking("PAYPAL")))
        .isInstanceOf(IllegalStateException.class);
    server.verify();
  }
}
