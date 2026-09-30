package com.travelplan.common;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.*;

class PlatformAccessTest {
  @ParameterizedTest
  @CsvSource({
    "TRAVELER,/api/explore,200",
    "TRAVELER,/api/bookings,200",
    "TRAVELER,/api/manage/travels,403",
    "TRAVELER,/api/users,403",
    "TRAVELER,/api/payments,403",
    "TRAVEL_MANAGER,/api/manage/travels,200",
    "TRAVEL_MANAGER,/api/users,403",
    "ADMIN,/api/manage/travels,200",
    "VIEWER,/api/bookings,403",
    "TRAVELER,/api/explore-evil,403"
  })
  void routesRespectRoles(String role, String path, int status) throws Exception {
    var filter =
        new SecurityFilter(
            t -> new SessionUser("1", "Test", "t@example.test", role, "csrf"),
            "https://localhost",
            "service");
    var req = new MockHttpServletRequest("GET", path);
    var response = new MockHttpServletResponse();
    filter.doFilter(req, response, new MockFilterChain());
    assertThat(response.getStatus()).isEqualTo(status);
  }

  @ParameterizedTest
  @CsvSource({
    "POST,/api/bookings",
    "POST,/api/feedback",
    "POST,/api/reports",
    "PUT,/api/manage/travels/1"
  })
  void allWritesRequireCsrf(String method, String path) throws Exception {
    var filter =
        new SecurityFilter(
            t -> new SessionUser("1", "Test", "t@example.test", "ADMIN", "csrf"),
            "https://localhost",
            "service");
    var req = new MockHttpServletRequest(method, path);
    req.addHeader("Origin", "https://localhost");
    var response = new MockHttpServletResponse();
    filter.doFilter(req, response, new MockFilterChain());
    assertThat(response.getStatus()).isEqualTo(403);
  }
}
