package com.travelplan.identity;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class BootstrapTest {
  private static final String STATE = "select exists(select 1 from identity.bootstrap_state)";
  private static final String USERS = "select exists(select 1 from identity.users)";
  private static final String MARK =
      "insert into identity.bootstrap_state(singleton) values (true) on conflict do nothing";

  @Test
  void anUninitializedEmptyStoreCreatesOneHashedAdministratorBeforeMarkingInitialized() {
    var db = mock(JdbcTemplate.class);
    when(db.queryForObject(STATE, Boolean.class)).thenReturn(false);
    when(db.queryForObject(USERS, Boolean.class)).thenReturn(false);
    var password = "Regression-only-password-42";

    new Bootstrap(db, password).run(null);

    var encoded = ArgumentCaptor.forClass(String.class);
    var ordered = inOrder(db);
    ordered.verify(db).execute("select pg_advisory_xact_lock(9147002)");
    ordered.verify(db).queryForObject(STATE, Boolean.class);
    ordered.verify(db).queryForObject(USERS, Boolean.class);
    ordered.verify(db).update(startsWith("insert into identity.users"), encoded.capture());
    ordered.verify(db).update(MARK);
    assertThat(encoded.getValue()).isNotEqualTo(password);
    assertThat(new BCryptPasswordEncoder().matches(password, encoded.getValue())).isTrue();
  }

  @Test
  void aDurableMarkerPreventsRecreationAfterTheAdministratorHasBeenDeleted() {
    var db = mock(JdbcTemplate.class);
    when(db.queryForObject(STATE, Boolean.class)).thenReturn(true);

    new Bootstrap(db, "unused-bootstrap-password").run(null);

    verify(db).execute("select pg_advisory_xact_lock(9147002)");
    verify(db).queryForObject(STATE, Boolean.class);
    verifyNoMoreInteractions(db);
  }

  @Test
  void anExistingStoreGetsAMarkerWithoutRecreatingOrChangingAccounts() {
    var db = mock(JdbcTemplate.class);
    when(db.queryForObject(STATE, Boolean.class)).thenReturn(false);
    when(db.queryForObject(USERS, Boolean.class)).thenReturn(true);

    new Bootstrap(db, "unused-bootstrap-password").run(null);

    verify(db, never()).update(startsWith("insert into identity.users"), any(Object.class));
    verify(db).update(MARK);
  }

  @Test
  void failedAccountCreationCannotMarkAnEmptyStoreInitialized() {
    var db = mock(JdbcTemplate.class);
    when(db.queryForObject(STATE, Boolean.class)).thenReturn(false);
    when(db.queryForObject(USERS, Boolean.class)).thenReturn(false);
    when(db.update(startsWith("insert into identity.users"), any(Object.class)))
        .thenThrow(new DataIntegrityViolationException("Unavailable account insert"));

    assertThatThrownBy(() -> new Bootstrap(db, "Regression-only-password-42").run(null))
        .isInstanceOf(DataIntegrityViolationException.class);

    verify(db, never()).update(MARK);
  }
}
