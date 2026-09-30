package com.travelplan.identity;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class IdentityTest {
  @Test
  void rawSessionsAreNeverStored() {
    assertThat(IdentityController.hash("session-secret"))
        .hasSize(64)
        .doesNotContain("session-secret");
  }

  @Test
  void emptySessionDoesNotHitDatabase() {
    var db = mock(JdbcTemplate.class);
    assertThat(new IdentityController(db).verify("")).isNull();
    verifyNoInteractions(db);
  }
}
