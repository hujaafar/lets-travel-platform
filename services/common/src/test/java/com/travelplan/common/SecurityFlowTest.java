package com.travelplan.common;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;

class SecurityFlowTest {
  private final SessionVerifier verifier = mock(SessionVerifier.class);
  private final SecurityFilter filter =
      new SecurityFilter(verifier, "https://localhost:8443", "service-key");
  private final MockHttpServletResponse response = new MockHttpServletResponse();

  private MockHttpServletRequest request(String method, String path) {
    var request = new MockHttpServletRequest(method, path);
    request.addHeader("Origin", "https://localhost:8443");
    request.addHeader("X-CSRF-Token", "csrf");
    request.setCookies(new Cookie("other", "ignored"), new Cookie("tp_session", "opaque"));
    return request;
  }

  @Test
  void authorizedMutationSetsTheActorAndPreservesValidRequestCorrelation() throws Exception {
    var admin = new SessionUser("id", "Admin", "admin@example.test", "ADMIN", "csrf");
    when(verifier.verify("opaque")).thenReturn(admin);
    var request = request("POST", "/api/users");
    request.addHeader("X-Request-ID", "review-123");
    FilterChain chain =
        (req, res) -> {
          assertThat(req.getAttribute("user")).isEqualTo(admin);
          assertThat(org.slf4j.MDC.get("actorId")).isEqualTo("id");
        };
    filter.doFilter(request, response, chain);
    assertThat(response.getStatus()).isEqualTo(200);
    assertThat(response.getHeader("X-Request-ID")).isEqualTo("review-123");
    assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
    assertThat(org.slf4j.MDC.get("actorId")).isNull();
  }

  @Test
  void aValidSessionCannotBypassRoleChecksWithACorrectCsrfToken() throws Exception {
    when(verifier.verify("opaque"))
        .thenReturn(new SessionUser("id", "Viewer", "v@example.test", "VIEWER", "csrf"));
    var chain = mock(FilterChain.class);
    filter.doFilter(request("DELETE", "/api/travels/1"), response, chain);
    assertThat(response.getStatus()).isEqualTo(403);
    verifyNoInteractions(chain);
  }

  static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments> adminEndpoints() {
    return java.util.stream.Stream.of("ADMIN", "VIEWER", "TRAVEL_MANAGER", "UNKNOWN")
        .flatMap(role -> java.util.stream.Stream.of("GET", "HEAD", "POST", "PUT", "DELETE")
            .flatMap(method -> java.util.stream.Stream.of(
                "/api/users", "/api/travels", "/api/travels/graph-status", "/api/payments")
                .map(path -> org.junit.jupiter.params.provider.Arguments.of(role, method, path))));
  }

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.MethodSource("adminEndpoints")
  void onlyAdministratorsCanReadOrModifyBusinessEndpoints(String role, String method, String path)
      throws Exception {
    when(verifier.verify("opaque"))
        .thenReturn(new SessionUser("id", "Account", "a@example.test", role, "csrf"));
    var chain = mock(FilterChain.class);
    var req = request(method, path);
    filter.doFilter(req, response, chain);
    if (role.equals("ADMIN")) {
      assertThat(response.getStatus()).isEqualTo(200);
      verify(chain).doFilter(req, response);
    } else {
      assertThat(response.getStatus()).isEqualTo(403);
      verifyNoInteractions(chain);
    }
  }

  @Test
  void nonAdministratorsCanStillInspectAndCloseTheirOwnSession() throws Exception {
    when(verifier.verify("opaque"))
        .thenReturn(new SessionUser("id", "Viewer", "v@example.test", "VIEWER", "csrf"));
    for (var path : java.util.List.of("/api/auth/me", "/api/auth/logout")) {
      var req = request(path.endsWith("logout") ? "POST" : "GET", path);
      var res = new MockHttpServletResponse();
      var chain = mock(FilterChain.class);
      filter.doFilter(req, res, chain);
      verify(chain).doFilter(req, res);
    }
  }

  @Test
  void authenticationOutagesFailClosedWithoutReachingControllers() throws Exception {
    when(verifier.verify("opaque")).thenThrow(new IllegalStateException("identity unavailable"));
    var chain = mock(FilterChain.class);
    filter.doFilter(request("GET", "/api/travels"), response, chain);
    assertThat(response.getStatus()).isEqualTo(503);
    assertThat(response.getHeader("Retry-After")).isEqualTo("2");
    assertThat(response.getContentAsString()).doesNotContain("identity unavailable");
    verifyNoInteractions(chain);
  }

  @Test
  void anExpiredRemoteSessionStillRequiresSignIn() throws Exception {
    when(verifier.verify("opaque"))
        .thenThrow(
            org.springframework.web.client.HttpClientErrorException.create(
                org.springframework.http.HttpStatus.UNAUTHORIZED,
                "expired",
                org.springframework.http.HttpHeaders.EMPTY,
                new byte[0],
                null));
    var chain = mock(FilterChain.class);
    filter.doFilter(request("GET", "/api/travels"), response, chain);
    assertThat(response.getStatus()).isEqualTo(401);
    verifyNoInteractions(chain);
  }

  @Test
  void loginNeedsOriginButDoesNotRequireAnExistingSession() throws Exception {
    var chain = mock(FilterChain.class);
    var request = request("POST", "/api/auth/login");
    filter.doFilter(request, response, chain);
    verify(chain).doFilter(request, response);
    verifyNoInteractions(verifier);
  }

  @Test
  void internalAuthenticationAcceptsOnlyTheExactServiceKey() throws Exception {
    var request = request("POST", "/internal/session");
    request.addHeader("X-Service-Key", "service-key");
    var chain = mock(FilterChain.class);
    filter.doFilter(request, response, chain);
    verify(chain).doFilter(request, response);
    verifyNoInteractions(verifier);
  }
}
