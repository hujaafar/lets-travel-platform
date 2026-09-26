package com.travelplan.payments;

import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

@Component
public class ProviderClient {
  private final String stripe, paypalId, paypalSecret;
  private final RestClient client;

  @Autowired
  public ProviderClient(
      @Value("${STRIPE_SECRET_KEY:}") String stripe,
      @Value("${PAYPAL_CLIENT_ID:}") String id,
      @Value("${PAYPAL_CLIENT_SECRET:}") String secret) {
    this(stripe, id, secret, createClient());
  }

  ProviderClient(String stripe, String id, String secret, RestClient client) {
    this.stripe = stripe;
    this.paypalId = id;
    this.paypalSecret = secret;
    this.client = client;
  }

  private static RestClient createClient() {
    var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofSeconds(5));
    factory.setReadTimeout(Duration.ofSeconds(10));
    return RestClient.builder().requestFactory(factory).build();
  }

  public boolean configured(String provider) {
    return provider.equals("STRIPE")
        ? stripe.startsWith("sk_test_")
        : !paypalId.isBlank() && !paypalSecret.isBlank();
  }

  public void test(String provider) {
    if (!configured(provider))
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "Add sandbox credentials to Vault to connect this provider");
    try {
      if (provider.equals("STRIPE"))
        client
            .get()
            .uri("https://api.stripe.com/v1/balance")
            .headers(h -> h.setBearerAuth(stripe))
            .retrieve()
            .toBodilessEntity();
      else
        client
            .post()
            .uri("https://api-m.sandbox.paypal.com/v1/oauth2/token")
            .headers(h -> h.setBasicAuth(paypalId, paypalSecret))
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body("grant_type=client_credentials")
            .retrieve()
            .body(Map.class);
    } catch (Exception e) {
      throw new ResponseStatusException(
          HttpStatus.BAD_GATEWAY, "Provider rejected the credentials or is unavailable");
    }
  }
}
