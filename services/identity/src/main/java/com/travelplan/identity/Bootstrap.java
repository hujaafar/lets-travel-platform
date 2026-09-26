package com.travelplan.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class Bootstrap implements ApplicationRunner {
  private final JdbcTemplate db;
  private final String password;

  public Bootstrap(JdbcTemplate db, @Value("${ADMIN_PASSWORD}") String password) {
    this.db = db;
    this.password = password;
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    // One transaction owns first initialization even when replicas start together.
    db.execute("select pg_advisory_xact_lock(9147002)");
    if (Boolean.TRUE.equals(
        db.queryForObject("select exists(select 1 from identity.bootstrap_state)", Boolean.class)))
      return;
    // Existing stores are already initialized, including when their original
    // administrator was deleted. Never turn a restart into account recovery.
    if (!Boolean.TRUE.equals(
        db.queryForObject("select exists(select 1 from identity.users)", Boolean.class))) {
      db.update(
          "insert into identity.users(id,name,email,role,status,password_hash) values"
              + " ('00000000-0000-0000-0000-000000000001','Workspace"
              + " admin','admin@travelplan.local','ADMIN','ACTIVE',?)",
          new BCryptPasswordEncoder(12).encode(password));
    }
    db.update("insert into identity.bootstrap_state(singleton) values (true) on conflict do nothing");
  }
}
