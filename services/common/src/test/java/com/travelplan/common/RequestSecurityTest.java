package com.travelplan.common;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestSecurityTest {
  private final SessionUser admin =
      new SessionUser("id", "Admin", "admin@example.test", "ADMIN", "csrf");

  @Test
  void anExternalOriginCannotUseAValidSessionAndCsrfToken() throws Exception {
    var request = new MockHttpServletRequest("POST", "/api/users");
    request.addHeader("Origin", "https://untrusted.example");
    request.addHeader("X-CSRF-Token", "csrf");
    var response = new MockHttpServletResponse();
    new SecurityFilter(token -> admin, "https://localhost:8443", "internal-secret")
        .doFilter(request, response, new MockFilterChain());
    assertThat(response.getStatus()).isEqualTo(403);
  }

  @Test
  void internalEndpointsDoNotAcceptBrowserSessions() throws Exception {
    var request = new MockHttpServletRequest("POST", "/internal/session");
    var response = new MockHttpServletResponse();
    new SecurityFilter(token -> admin, "https://localhost:8443", "internal-secret")
        .doFilter(request, response, new MockFilterChain());
    assertThat(response.getStatus()).isEqualTo(401);
  }

  @Test
  void unsafeRequestIdsCannotPolluteStructuredLogs() throws Exception {
    var request = new MockHttpServletRequest("GET", "/actuator/health");
    request.addHeader("X-Request-ID", "a\r\nforged-log-entry");
    var response = new MockHttpServletResponse();
    new SecurityFilter(token -> admin, "https://localhost:8443", "secret")
        .doFilter(request, response, new MockFilterChain());
    assertThat(response.getHeader("X-Request-ID")).matches("[a-f0-9-]{36}");
    assertThat(org.slf4j.MDC.get("requestId")).isNull();
  }
}
