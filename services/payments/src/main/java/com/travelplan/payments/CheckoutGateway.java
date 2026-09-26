package com.travelplan.payments;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

/** Hosted sandbox checkout: card data never enters our API or database. */
@Component
public class CheckoutGateway {
  private final String stripe, paypalId, paypalSecret, origin;
  private final RestClient client;

  public record Hosted(String id, String url) {}

  public record Settlement(boolean paid, boolean expired, String capture) {}

  public CheckoutGateway(
      @Value("${STRIPE_SECRET_KEY:}") String stripe,
      @Value("${PAYPAL_CLIENT_ID:}") String id,
      @Value("${PAYPAL_CLIENT_SECRET:}") String secret,
      @Value("${app.origin}") String origin) {
    this.stripe = stripe;
    paypalId = id;
    paypalSecret = secret;
    this.origin = origin;
    var f = new org.springframework.http.client.SimpleClientHttpRequestFactory();
    f.setConnectTimeout(5000);
    f.setReadTimeout(10000);
    client = RestClient.builder().requestFactory(f).build();
  }

  public boolean configured(String provider) {
    return "STRIPE".equals(provider)
        ? stripe.startsWith("sk_test_")
        : "PAYPAL".equals(provider) && !paypalId.isBlank() && !paypalSecret.isBlank();
  }

  private String token() {
    return Objects.toString(
        client
            .post()
            .uri("https://api-m.sandbox.paypal.com/v1/oauth2/token")
            .headers(h -> h.setBasicAuth(paypalId, paypalSecret))
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body("grant_type=client_credentials")
            .retrieve()
            .body(Map.class)
            .get("access_token"));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> stripe(
      String method, String path, Map<String, String> fields, String key) {
    if (!stripe.startsWith("sk_test_"))
      throw new IllegalStateException("Stripe sandbox is not configured");
    var req =
        client
            .method(org.springframework.http.HttpMethod.valueOf(method))
            .uri("https://api.stripe.com/v1" + path)
            .headers(
                h -> {
                  h.setBearerAuth(stripe);
                  if (key != null) h.set("Idempotency-Key", key);
                });
    var form = new LinkedMultiValueMap<String, String>();
    fields.forEach(form::add);
    if (!"GET".equals(method)) req.contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form);
    return req.retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> paypal(String method, String path, Object body, String key) {
    var req =
        client
            .method(org.springframework.http.HttpMethod.valueOf(method))
            .uri("https://api-m.sandbox.paypal.com" + path)
            .headers(
                h -> {
                  h.setBearerAuth(token());
                  h.set("Prefer", "return=representation");
                  if (key != null) h.set("PayPal-Request-Id", key);
                });
    if (body != null) req.contentType(MediaType.APPLICATION_JSON).body(body);
    return req.retrieve().body(Map.class);
  }

  public Hosted create(Map<String, Object> b) {
    String id = b.get("id").toString(), currency = b.get("currency").toString().trim();
    if ("STRIPE".equals(b.get("provider"))) {
      var f = new HashMap<String, String>();
      f.put("mode", "payment");
      f.put("payment_method_types[0]", "card");
      f.put("client_reference_id", id);
      f.put("line_items[0][quantity]", "1");
      f.put("line_items[0][price_data][currency]", currency.toLowerCase(Locale.ROOT));
      f.put(
          "line_items[0][price_data][unit_amount]",
          new BigDecimal(b.get("amount").toString())
              .movePointRight(2)
              .toBigIntegerExact()
              .toString());
      f.put(
          "line_items[0][price_data][product_data][name]",
          "Let's Travel booking " + id.substring(0, 8));
      f.put("success_url", origin + "/?checkout=" + id);
      f.put("cancel_url", origin + "/?checkout=" + id);
      f.put(
          "expires_at",
          Long.toString(((java.sql.Timestamp) b.get("expires_at")).toInstant().getEpochSecond()));
      var result = stripe("POST", "/checkout/sessions", f, "booking-" + id);
      return new Hosted(result.get("id").toString(), result.get("url").toString());
    }
    var result =
        paypal(
            "POST",
            "/v2/checkout/orders",
            Map.of(
                "intent",
                "CAPTURE",
                "purchase_units",
                List.of(
                    Map.of(
                        "custom_id",
                        id,
                        "amount",
                        Map.of("currency_code", currency, "value", b.get("amount").toString()))),
                "payment_source",
                Map.of(
                    "paypal",
                    Map.of(
                        "experience_context",
                        Map.of(
                            "return_url",
                            origin + "/?checkout=" + id,
                            "cancel_url",
                            origin + "/?checkout=" + id,
                            "user_action",
                            "PAY_NOW",
                            "shipping_preference",
                            "NO_SHIPPING")))),
            id);
    var links = (List<?>) result.get("links");
    String url =
        links.stream()
            .map(x -> (Map<?, ?>) x)
            .filter(x -> Set.of("payer-action", "approve").contains(x.get("rel")))
            .map(x -> x.get("href").toString())
            .findFirst()
            .orElseThrow();
    return new Hosted(result.get("id").toString(), url);
  }

  public Settlement inspect(Map<String, Object> b, boolean capture) {
    String id = b.get("provider_id").toString();
    if ("STRIPE".equals(b.get("provider"))) {
      var r = stripe("GET", "/checkout/sessions/" + id, Map.of(), null);
      validateStripe(b, r);
      return new Settlement(
          "paid".equals(r.get("payment_status")),
          "expired".equals(r.get("status")),
          Objects.toString(r.get("payment_intent"), ""));
    }
    var r = paypal("GET", "/v2/checkout/orders/" + id, null, null);
    validatePayPal(b, r);
    if (capture && "APPROVED".equals(r.get("status"))) {
      r =
          paypal(
              "POST", "/v2/checkout/orders/" + id + "/capture", Map.of(), "capture-" + b.get("id"));
      validatePayPal(b, r);
    }
    if ("COMPLETED".equals(r.get("status"))) {
      var unit = (Map<?, ?>) ((List<?>) r.get("purchase_units")).get(0);
      var payment = (Map<?, ?>) unit.get("payments");
      var captures = (List<?>) payment.get("captures");
      if (captures.size() != 1) throw new IllegalStateException("Unexpected capture count");
      var c = (Map<?, ?>) captures.get(0);
      validateAmount(b, (Map<?, ?>) c.get("amount"));
      return new Settlement("COMPLETED".equals(c.get("status")), false, c.get("id").toString());
    }
    return new Settlement(false, "VOIDED".equals(r.get("status")), "");
  }

  static void validateStripe(Map<String, Object> b, Map<String, Object> r) {
    if (!b.get("id").toString().equals(r.get("client_reference_id"))
        || !b.get("currency")
            .toString()
            .trim()
            .equalsIgnoreCase(Objects.toString(r.get("currency")))
        || new BigDecimal(b.get("amount").toString())
                .movePointRight(2)
                .compareTo(new BigDecimal(r.get("amount_total").toString()))
            != 0) throw new IllegalStateException("Provider payment does not match booking");
  }

  static void validatePayPal(Map<String, Object> b, Map<String, Object> r) {
    var units = (List<?>) r.get("purchase_units");
    if (units.size() != 1) throw new IllegalStateException("Unexpected purchase units");
    var u = (Map<?, ?>) units.get(0);
    if (!b.get("id").toString().equals(u.get("custom_id")))
      throw new IllegalStateException("Provider booking reference differs");
    validateAmount(b, (Map<?, ?>) u.get("amount"));
  }

  static void validateAmount(Map<String, Object> b, Map<?, ?> amount) {
    if (!b.get("currency").toString().trim().equals(amount.get("currency_code"))
        || new BigDecimal(b.get("amount").toString())
                .compareTo(new BigDecimal(amount.get("value").toString()))
            != 0) throw new IllegalStateException("Provider amount differs");
  }

  public void expire(Map<String, Object> b) {
    if ("STRIPE".equals(b.get("provider")))
      stripe(
          "POST",
          "/checkout/sessions/" + b.get("provider_id") + "/expire",
          Map.of(),
          "expire-" + b.get("id"));
    // PayPal orders cannot charge without our server capture. Once cancellation
    // is committed, inspect never captures that order again.
  }

  public String refund(Map<String, Object> b, String capture) {
    var r =
        "STRIPE".equals(b.get("provider"))
            ? stripe("POST", "/refunds", Map.of("payment_intent", capture), "refund-" + b.get("id"))
            : paypal(
                "POST",
                "/v2/payments/captures/" + capture + "/refund",
                Map.of(),
                "refund-" + b.get("id"));
    return r.get("id").toString();
  }

  public boolean refunded(Map<String, Object> b, String refundId) {
    var r =
        "STRIPE".equals(b.get("provider"))
            ? stripe("GET", "/refunds/" + refundId, Map.of(), null)
            : paypal("GET", "/v2/payments/refunds/" + refundId, null, null);
    return Set.of("succeeded", "COMPLETED").contains(r.get("status"));
  }
}
