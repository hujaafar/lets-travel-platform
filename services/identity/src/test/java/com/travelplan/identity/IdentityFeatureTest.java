package com.travelplan.identity;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.travelplan.common.SessionUser;
import jakarta.servlet.http.Cookie;
import java.sql.ResultSet;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.*;
import org.springframework.jdbc.core.*;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

class IdentityFeatureTest {
  private static final String PASSWORD = "A-long-fixture-password";
  private static final String HASH = new BCryptPasswordEncoder(4).encode(PASSWORD);
  private final UUID id = UUID.randomUUID();
  private final JdbcTemplate db = mock(JdbcTemplate.class);
  private final IdentityController controller = new IdentityController(db);

  private MockHttpServletRequest adminRequest() {
    var request = new MockHttpServletRequest();
    request.setAttribute(
        "user",
        new SessionUser(
            UUID.randomUUID().toString(), "Admin", "admin@example.test", "ADMIN", "csrf"));
    return request;
  }

  private IdentityController.UserInput user(String password) {
    return new IdentityController.UserInput(
        " Alice ", "ALICE@example.test", "VIEWER", "ACTIVE", password);
  }

  static java.util.stream.Stream<Arguments> passwordBoundaries() {
    return java.util.stream.Stream.of(
        Arguments.of("a".repeat(72), true),
        Arguments.of("é".repeat(36), true),
        Arguments.of("a".repeat(73), false),
        Arguments.of("é".repeat(37), false));
  }

  @ParameterizedTest
  @MethodSource("passwordBoundaries")
  void createAndResetEnforceBcryptUtf8BoundariesWithoutTruncating(
      String password, boolean accepted) {
    when(db.update(anyString(), any(Object[].class))).thenReturn(1);
    if (!accepted) {
      assertThatThrownBy(() -> controller.add(user(password)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("at most 72 UTF-8 bytes");
      assertThatThrownBy(() -> controller.update(id, user(password), adminRequest()))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("at most 72 UTF-8 bytes");
      assertThatThrownBy(
              () -> controller.login(new IdentityController.Login("alice@example.test", password)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("at most 72 UTF-8 bytes");
      verifyNoInteractions(db);
      return;
    }
    controller.add(user(password));
    controller.update(id, user(password), adminRequest());
    var encoded = ArgumentCaptor.forClass(String.class);
    verify(db)
        .update(startsWith("update identity.users set password_hash"), encoded.capture(), eq(id));
    assertThat(new BCryptPasswordEncoder().matches(password, encoded.getValue())).isTrue();
  }

  @SuppressWarnings("unchecked")
  private void sessionRow(AtomicReference<String> csrf) throws Exception {
    when(db.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            call -> {
              var rs = mock(ResultSet.class);
              when(rs.getString(1)).thenReturn(id.toString());
              when(rs.getString(2)).thenReturn("Alice");
              when(rs.getString(3)).thenReturn("alice@example.test");
              when(rs.getString(4)).thenReturn("VIEWER");
              when(rs.getString(5)).thenReturn(csrf.get());
              return List.of(((RowMapper<SessionUser>) call.getArgument(1)).mapRow(rs, 0));
            });
  }

  @Test
  void loginNormalizesEmailStoresOnlyTheTokenHashAndReturnsASecureSession() throws Exception {
    when(db.queryForList(anyString(), eq("alice@example.test")))
        .thenReturn(List.of(Map.of("id", id, "password_hash", HASH, "status", "ACTIVE")));
    var csrf = new AtomicReference<String>();
    var tokenHash = new AtomicReference<String>();
    when(db.update(startsWith("insert into identity.sessions"), any(Object[].class)))
        .thenAnswer(
            call -> {
              var values = (Object[]) call.getRawArguments()[1];
              tokenHash.set((String) values[0]);
              assertThat(values[1]).isEqualTo(id);
              csrf.set((String) values[2]);
              return 1;
            });
    sessionRow(csrf);

    var response = controller.login(new IdentityController.Login(" ALICE@example.test ", PASSWORD));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    var cookie = response.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
    assertThat(cookie).contains("HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=28800");
    var rawToken = cookie.substring("tp_session=".length(), cookie.indexOf(';'));
    assertThat(rawToken).hasSize(43);
    assertThat(tokenHash.get())
        .isEqualTo(IdentityController.hash(rawToken))
        .doesNotContain(rawToken);
    assertThat((SessionUser) response.getBody())
        .isEqualTo(
            new SessionUser(id.toString(), "Alice", "alice@example.test", "VIEWER", csrf.get()));
    assertThat(csrf.get()).hasSize(43).isNotEqualTo(rawToken);
    verify(db).update("delete from identity.login_attempts where email=?", "alice@example.test");
  }

  @ParameterizedTest
  @ValueSource(strings = {"wrong-password", "unknown-email", "suspended-account"})
  void failedLoginNeverCreatesASessionAndUsesAGenericError(String reason) {
    if (!reason.equals("unknown-email"))
      when(db.queryForList(anyString(), eq("alice@example.test")))
          .thenReturn(
              List.of(
                  Map.of(
                      "id",
                      id,
                      "password_hash",
                      HASH,
                      "status",
                      reason.equals("suspended-account") ? "SUSPENDED" : "ACTIVE")));
    assertThatThrownBy(
            () ->
                controller.login(
                    new IdentityController.Login(
                        "alice@example.test",
                        reason.equals("wrong-password") ? "incorrect-password" : PASSWORD)))
        .isInstanceOfSatisfying(
            ResponseStatusException.class,
            error -> {
              assertThat(error.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
              assertThat(error.getReason()).isEqualTo("Email or password is incorrect");
            });
    verify(db).update(startsWith("update identity.login_attempts"), eq("alice@example.test"));
    verify(db, never()).update(startsWith("insert into identity.sessions"), any(Object[].class));
  }

  @Test
  void lockedAccountsAreRejectedBeforePasswordVerification() {
    when(db.queryForObject(anyString(), eq(Boolean.class), eq("alice@example.test")))
        .thenReturn(true);
    assertThatThrownBy(
            () -> controller.login(new IdentityController.Login("alice@example.test", PASSWORD)))
        .isInstanceOfSatisfying(
            ResponseStatusException.class,
            error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    verify(db, never()).queryForList(anyString(), any(Object[].class));
  }

  @Test
  void sessionVerificationUsesTheHashedCookieAndMapsCurrentAccountData() throws Exception {
    sessionRow(new AtomicReference<>("csrf-record"));
    var result = controller.verify("opaque-cookie");
    assertThat(result.role()).isEqualTo("VIEWER");
    assertThat(result.csrf()).isEqualTo("csrf-record");
    verify(db)
        .query(
            contains("s.expires_at>now()"),
            any(RowMapper.class),
            eq(IdentityController.hash("opaque-cookie")));
    assertThat(controller.internal(Map.of("token", "opaque-cookie"))).isEqualTo(result);
    var request = adminRequest();
    assertThat(controller.me(request)).isSameAs(request.getAttribute("user"));
  }

  @Test
  void expiredOrRevokedSessionsCannotUseInternalVerification() {
    assertThat(controller.verify("unknown-cookie")).isNull();
    assertThatThrownBy(() -> controller.internal(Map.of("token", "unknown-cookie")))
        .isInstanceOfSatisfying(
            ResponseStatusException.class,
            error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
  }

  @Test
  void logoutRevokesTheStoredSessionAndExpiresTheCookie() {
    var request = new MockHttpServletRequest();
    request.setCookies(new Cookie("tp_session", "opaque-cookie"));
    var response = controller.logout(request);
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    assertThat(response.getHeaders().getFirst(HttpHeaders.SET_COOKIE))
        .contains("tp_session=;", "Max-Age=0", "Secure", "HttpOnly", "SameSite=Strict");
    verify(db)
        .update(
            "delete from identity.sessions where token_hash=?",
            IdentityController.hash("opaque-cookie"));
  }

  @Test
  void accountCreationNormalizesIdentityAndHashesItsPassword() {
    var created = controller.add(user(PASSWORD)).get("id");
    var password = ArgumentCaptor.forClass(String.class);
    verify(db)
        .update(
            startsWith("insert into identity.users"),
            eq(created),
            eq("Alice"),
            eq("alice@example.test"),
            eq("VIEWER"),
            eq("ACTIVE"),
            password.capture());
    assertThat(new BCryptPasswordEncoder().matches(PASSWORD, password.getValue())).isTrue();
  }

  @Test
  void accountListingReturnsAdministrativeFieldsWithoutSelectingPasswordHashes() {
    var row =
        Map.<String, Object>of(
            "id",
            id,
            "name",
            "Alice",
            "email",
            "alice@example.test",
            "role",
            "VIEWER",
            "status",
            "ACTIVE");
    when(db.queryForList(anyString())).thenReturn(List.of(row));
    assertThat(controller.list()).containsExactly(row);
    var sql = ArgumentCaptor.forClass(String.class);
    verify(db).queryForList(sql.capture());
    assertThat(sql.getValue()).doesNotContain("password_hash", "select *");
  }

  @Test
  void editingWithoutAPasswordPreservesSessionsButResettingRevokesThem() {
    when(db.update(anyString(), any(Object[].class))).thenReturn(1);
    controller.update(id, user(""), adminRequest());
    verify(db, never())
        .update(startsWith("update identity.users set password_hash"), any(Object[].class));
    verify(db, never()).update("delete from identity.sessions where user_id=?", id);
    controller.update(id, user(PASSWORD), adminRequest());
    var hash = ArgumentCaptor.forClass(String.class);
    verify(db)
        .update(startsWith("update identity.users set password_hash"), hash.capture(), eq(id));
    assertThat(new BCryptPasswordEncoder().matches(PASSWORD, hash.getValue())).isTrue();
    verify(db).update("delete from identity.sessions where user_id=?", id);
  }

  @Test
  void absentUsersProduceNotFoundForEditsAndDeletion() {
    for (var action :
        List.<Runnable>of(
            () -> controller.update(id, user(null), adminRequest()),
            () -> controller.delete(id, adminRequest())))
      assertThatThrownBy(action::run)
          .isInstanceOfSatisfying(
              ResponseStatusException.class,
              error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
  }

  @Test
  void theFinalActiveAdministratorCannotBeDemotedOrDeleted() {
    when(db.queryForList(startsWith("select role,status"), eq(id)))
        .thenReturn(List.of(Map.of("role", "ADMIN", "status", "ACTIVE")));
    when(db.queryForObject(contains("count(*)"), eq(Integer.class))).thenReturn(1);
    for (var action :
        List.<Runnable>of(
            () -> controller.update(id, user(null), adminRequest()),
            () -> controller.delete(id, adminRequest())))
      assertThatThrownBy(action::run)
          .isInstanceOfSatisfying(
              ResponseStatusException.class,
              error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    verify(db, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void anotherAdministratorCanBeDeletedWhileOneRemains() {
    when(db.queryForList(startsWith("select role,status"), eq(id)))
        .thenReturn(List.of(Map.of("role", "ADMIN", "status", "ACTIVE")));
    when(db.queryForObject(contains("count(*)"), eq(Integer.class))).thenReturn(2);
    when(db.update(anyString(), any(Object[].class))).thenReturn(1);
    controller.delete(id, adminRequest());
    verify(db).update("delete from identity.users where id=?", id);
  }
}
