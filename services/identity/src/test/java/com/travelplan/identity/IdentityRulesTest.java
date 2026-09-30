package com.travelplan.identity;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.travelplan.common.SessionUser;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;

class IdentityRulesTest {
  @Test
  void administratorsCannotDeleteThemselves() {
    var id = UUID.randomUUID();
    var db = mock(JdbcTemplate.class);
    var request = new MockHttpServletRequest();
    request.setAttribute(
        "user", new SessionUser(id.toString(), "Admin", "a@b.test", "ADMIN", "csrf"));
    assertThatThrownBy(() -> new IdentityController(db).delete(id, request))
        .hasMessageContaining("own admin access");
    verify(db, never()).update("delete from identity.users where id=?", id);
  }

  @Test
  void shortPasswordsAndUnsupportedRolesAreRejectedBeforeWriting() {
    var db = mock(JdbcTemplate.class);
    var controller = new IdentityController(db);
    assertThatThrownBy(
            () ->
                controller.add(
                    new IdentityController.UserInput("A", "a@b.test", "VIEWER", "ACTIVE", "short")))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("12 characters");
    assertThatThrownBy(
            () ->
                controller.add(
                    new IdentityController.UserInput(
                        "A", "a@b.test", "SUPERUSER", "ACTIVE", "LongPasswordForTest")))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("role");
    verifyNoInteractions(db);
  }
}
