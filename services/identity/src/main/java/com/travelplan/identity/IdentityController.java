package com.travelplan.identity;

import com.travelplan.common.*;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class IdentityController implements SessionVerifier {
  private static final SecureRandom RANDOM = new SecureRandom();
  private final JdbcTemplate db;
  private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);

  public IdentityController(JdbcTemplate db) {
    this.db = db;
  }

  public record Login(@Email @NotBlank String email, @NotBlank @Size(max = 72) String password) {}

  public record UserInput(
      @NotBlank @Size(max = 100) String name,
      @Email @NotBlank @Size(max = 254) String email,
      @NotBlank String role,
      @NotBlank String status,
      @Size(max = 72) String password) {}

  public static String hash(String text) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private static String random() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  @PostMapping("/api/auth/login")
  public ResponseEntity<?> login(@Valid @RequestBody Login input) {
    validatePasswordBytes(input.password());
    String email = input.email().toLowerCase(Locale.ROOT).trim();
    db.update(
        "insert into identity.login_attempts(email) values (?) on conflict do nothing", email);
    Boolean locked =
        db.queryForObject(
            "select locked_until>now() from identity.login_attempts where email=?",
            Boolean.class,
            email);
    if (Boolean.TRUE.equals(locked))
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in 15 minutes.");
    var rows = db.queryForList("select * from identity.users where email=?", email);
    String dummy = "$2a$12$xSo.JdNrcmSvsvIL8LXuHOVGiZj88TB4Cm4kvK8tniPOzlOWBp1kK";
    boolean matches =
        passwords.matches(
            input.password(), rows.isEmpty() ? dummy : rows.get(0).get("password_hash").toString());
    if (rows.isEmpty() || !matches || !rows.get(0).get("status").equals("ACTIVE")) {
      db.update(
          "update identity.login_attempts set failures=case when locked_until<now() then 1 else"
              + " failures+1 end, locked_until=case when failures>=4 and (locked_until is null or"
              + " locked_until>now()) then now()+interval '15 minutes' else null end where email=?",
          email);
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect");
    }
    db.update("delete from identity.login_attempts where email=?", email);
    String token = random(), csrf = random();
    Object id = rows.get(0).get("id");
    db.update(
        "insert into identity.sessions(token_hash,user_id,csrf,expires_at) values"
            + " (?,?,?,now()+interval '8 hours')",
        hash(token),
        id,
        csrf);
    return ResponseEntity.ok()
        .header(
            HttpHeaders.SET_COOKIE,
            ResponseCookie.from("tp_session", token)
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ofHours(8))
                .build()
                .toString())
        .body(verify(token));
  }

  @Override
  public SessionUser verify(String token) {
    if (token == null || token.isBlank()) return null;
    return db
        .query(
            "select u.id,u.name,u.email,u.role,s.csrf from identity.sessions s join identity.users"
                + " u on u.id=s.user_id where s.token_hash=? and s.expires_at>now() and"
                + " u.status='ACTIVE'",
            (rs, n) ->
                new SessionUser(
                    rs.getString(1),
                    rs.getString(2),
                    rs.getString(3),
                    rs.getString(4),
                    rs.getString(5)),
            hash(token))
        .stream()
        .findFirst()
        .orElse(null);
  }

  @PostMapping("/internal/session")
  public SessionUser internal(@RequestBody Map<String, String> body) {
    var user = verify(body.get("token"));
    if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    return user;
  }

  @GetMapping("/api/auth/me")
  public Object me(HttpServletRequest request) {
    return request.getAttribute("user");
  }

  @PostMapping("/api/auth/logout")
  public ResponseEntity<?> logout(HttpServletRequest r) {
    db.update("delete from identity.sessions where token_hash=?", hash(SecurityFilter.token(r)));
    return ResponseEntity.noContent()
        .header(
            HttpHeaders.SET_COOKIE,
            ResponseCookie.from("tp_session", "")
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .path("/")
                .maxAge(0)
                .build()
                .toString())
        .build();
  }

  @GetMapping("/api/users")
  public List<Map<String, Object>> list() {
    return db.queryForList(
        "select id,name,email,role,status,created_at from identity.users order by created_at desc");
  }

  private void validate(UserInput u, boolean creating) {
    if (!Set.of("ADMIN", "TRAVEL_MANAGER", "VIEWER").contains(u.role())
        || !Set.of("ACTIVE", "SUSPENDED").contains(u.status()))
      throw new IllegalArgumentException("Invalid role or status");
    if ((creating || (u.password() != null && !u.password().isBlank()))
        && (u.password() == null || u.password().isBlank() || u.password().length() < 12))
      throw new IllegalArgumentException("Password must contain at least 12 characters");
    if (u.password() != null && !u.password().isBlank()) validatePasswordBytes(u.password());
  }

  private static void validatePasswordBytes(String password) {
    if (password.getBytes(StandardCharsets.UTF_8).length > 72)
      throw new IllegalArgumentException("Password must contain at most 72 UTF-8 bytes");
  }

  @PostMapping("/api/users")
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> add(@Valid @RequestBody UserInput u) {
    validate(u, true);
    UUID id = UUID.randomUUID();
    db.update(
        "insert into identity.users(id,name,email,role,status,password_hash) values (?,?,?,?,?,?)",
        id,
        u.name().trim(),
        u.email().trim().toLowerCase(Locale.ROOT),
        u.role(),
        u.status(),
        passwords.encode(u.password()));
    return Map.of("id", id);
  }

  @PutMapping("/api/users/{id}")
  @Transactional
  public void update(@PathVariable UUID id, @Valid @RequestBody UserInput u, HttpServletRequest r) {
    validate(u, false);
    guard(id, u.role(), u.status(), r);
    int n =
        db.update(
            "update identity.users set name=?,email=?,role=?,status=? where id=?",
            u.name().trim(),
            u.email().trim().toLowerCase(Locale.ROOT),
            u.role(),
            u.status(),
            id);
    if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
    if (u.password() != null && !u.password().isBlank()) {
      db.update(
          "update identity.users set password_hash=? where id=?",
          passwords.encode(u.password()),
          id);
      db.update("delete from identity.sessions where user_id=?", id);
    }
  }

  @DeleteMapping("/api/users/{id}")
  @Transactional
  public void delete(@PathVariable UUID id, HttpServletRequest r) {
    guard(id, "DELETED", "DELETED", r);
    if (db.update("delete from identity.users where id=?", id) == 0)
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
  }

  private void guard(UUID id, String role, String status, HttpServletRequest request) {
    db.queryForList(
        "select id from identity.users where role='ADMIN' and status='ACTIVE' for update");
    SessionUser self = (SessionUser) request.getAttribute("user");
    if (id.toString().equals(self.id()) && (!role.equals("ADMIN") || !status.equals("ACTIVE")))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "You cannot remove or suspend your own admin access");
    var current = db.queryForList("select role,status from identity.users where id=?", id);
    if (!current.isEmpty()
        && current.get(0).get("role").equals("ADMIN")
        && current.get(0).get("status").equals("ACTIVE")
        && (!role.equals("ADMIN") || !status.equals("ACTIVE"))
        && db.queryForObject(
                "select count(*) from identity.users where role='ADMIN' and status='ACTIVE'",
                Integer.class)
            <= 1)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "At least one active administrator is required");
  }
}
