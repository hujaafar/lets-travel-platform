package com.travelplan.common;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class SecurityFilterTest {
  @Test
  void missingSecretsNeverMatch() {
    assertThat(SecurityFilter.same(null, null)).isFalse();
    assertThat(SecurityFilter.same("abc", "abc")).isTrue();
    assertThat(SecurityFilter.same("abc", "abd")).isFalse();
  }

  @Test
  void anonymousRequestIsRejected() throws Exception {
    var filter = new SecurityFilter(t -> null, "https://localhost", "secret");
    var request = new org.springframework.mock.web.MockHttpServletRequest("GET", "/api/travels");
    var response = new org.springframework.mock.web.MockHttpServletResponse();
    filter.doFilter(request, response, new org.springframework.mock.web.MockFilterChain());
    assertThat(response.getStatus()).isEqualTo(401);
  }

  @Test
  void csrfRequiredForWrites() throws Exception {
    var filter =
        new SecurityFilter(
            t -> new SessionUser("1", "Admin", "a@b.c", "ADMIN", "csrf"),
            "https://localhost",
            "secret");
    var req = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/travels");
    req.addHeader("Origin", "https://localhost");
    var res = new org.springframework.mock.web.MockHttpServletResponse();
    filter.doFilter(req, res, new org.springframework.mock.web.MockFilterChain());
    assertThat(res.getStatus()).isEqualTo(403);
  }
}
