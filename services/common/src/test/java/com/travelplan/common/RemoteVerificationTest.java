package com.travelplan.common;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class RemoteVerificationTest {
  @Test
  void verificationAuthenticatesTheServiceAndPropagatesTheRequestId() {
    var builder = RestClient.builder().baseUrl("https://identity.test");
    var server = MockRestServiceServer.bindTo(builder).build();
    server
        .expect(requestTo("https://identity.test/internal/session"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("X-Service-Key", "service-key"))
        .andExpect(header("X-Request-ID", "travel-request-123"))
        .andExpect(content().string("{\"token\":\"opaque-cookie\"}"))
        .andRespond(
            withSuccess(
                "{\"id\":\"user\",\"name\":\"Admin\",\"email\":\"a@example.test\",\"role\":\"ADMIN\",\"csrf\":\"csrf\"}",
                MediaType.APPLICATION_JSON));
    MDC.put("requestId", "travel-request-123");
    try {
      assertThat(
              RemoteSessionVerifier.createVerifier(builder, "service-key").verify("opaque-cookie"))
          .isEqualTo(new SessionUser("user", "Admin", "a@example.test", "ADMIN", "csrf"));
    } finally {
      MDC.clear();
    }
    server.verify();
  }

  @Test
  void failedRemoteAuthenticationNeverReturnsAnInventedPrincipal() {
    var builder = RestClient.builder().baseUrl("https://identity.test");
    var server = MockRestServiceServer.bindTo(builder).build();
    server
        .expect(requestTo("https://identity.test/internal/session"))
        .andRespond(withStatus(HttpStatus.UNAUTHORIZED));
    assertThatThrownBy(
            () -> RemoteSessionVerifier.createVerifier(builder, "service-key").verify("revoked"))
        .isInstanceOf(org.springframework.web.client.HttpClientErrorException.Unauthorized.class);
    server.verify();
  }
}
