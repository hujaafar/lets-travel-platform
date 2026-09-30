package com.travelplan.payments;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class ProviderHttpTest {
  @Test
  void stripeUsesTestBearerCredentialsAndAcceptsAProviderSuccess() {
    var builder = RestClient.builder();
    var server = MockRestServiceServer.bindTo(builder).build();
    server
        .expect(requestTo("https://api.stripe.com/v1/balance"))
        .andExpect(method(HttpMethod.GET))
        .andExpect(header("Authorization", "Bearer sk_test_regression"))
        .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
    new ProviderClient("sk_test_regression", "", "", builder.build()).test("STRIPE");
    server.verify();
  }

  @Test
  void paypalExchangesBothSandboxCredentialsAsFormEncodedOAuth() {
    var builder = RestClient.builder();
    var server = MockRestServiceServer.bindTo(builder).build();
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v1/oauth2/token"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Authorization", "Basic Y2xpZW50OnNlY3JldA=="))
        .andExpect(content().contentType(MediaType.APPLICATION_FORM_URLENCODED))
        .andExpect(content().string("grant_type=client_credentials"))
        .andRespond(withSuccess("{\"access_token\":\"test-token\"}", MediaType.APPLICATION_JSON));
    new ProviderClient("", "client", "secret", builder.build()).test("PAYPAL");
    server.verify();
  }

  @Test
  void providerRejectionDoesNotExposeUpstreamBodiesOrSecrets() {
    var builder = RestClient.builder();
    var server = MockRestServiceServer.bindTo(builder).build();
    server
        .expect(requestTo("https://api.stripe.com/v1/balance"))
        .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("sensitive provider detail"));
    assertThatThrownBy(
            () -> new ProviderClient("sk_test_regression", "", "", builder.build()).test("STRIPE"))
        .isInstanceOfSatisfying(
            ResponseStatusException.class,
            error -> {
              assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
              assertThat(error.getReason()).doesNotContain("sensitive", "sk_test_regression");
            });
    server.verify();
  }

  @Test
  void networkFailureIsReportedAsProviderUnavailability() {
    var builder = RestClient.builder();
    var server = MockRestServiceServer.bindTo(builder).build();
    server
        .expect(requestTo("https://api-m.sandbox.paypal.com/v1/oauth2/token"))
        .andRespond(withException(new java.io.IOException("connection interrupted")));
    assertThatThrownBy(
            () -> new ProviderClient("", "client", "secret", builder.build()).test("PAYPAL"))
        .isInstanceOfSatisfying(
            ResponseStatusException.class,
            error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY));
    server.verify();
  }
}
