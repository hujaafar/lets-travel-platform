package com.travelplan.payments;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/payments")
public class PaymentController {
  private final JdbcTemplate db;
  private final ProviderClient providers;

  public PaymentController(JdbcTemplate db, ProviderClient providers) {
    this.db = db;
    this.providers = providers;
  }

  public record Gateway(
      @NotBlank @Size(max = 100) String name,
      @NotBlank String provider,
      @NotBlank String currency,
      boolean enabled) {}

  static void validate(Gateway g) {
    if (!Set.of("STRIPE", "PAYPAL").contains(g.provider()))
      throw new IllegalArgumentException("Provider must be Stripe or PayPal");
    if (!Set.of("USD", "EUR", "GBP").contains(g.currency()))
      throw new IllegalArgumentException("Supported currencies are USD, EUR and GBP");
  }

  @GetMapping
  public List<Map<String, Object>> list() {
    var rows = db.queryForList("select * from payments.gateways order by created_at");
    rows.forEach(
        r -> {
          r.put("configured", providers.configured(r.get("provider").toString()));
          r.put("mode", "SANDBOX");
        });
    return rows;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Map<String, Object> create(@Valid @RequestBody Gateway g) {
    validate(g);
    UUID id = UUID.randomUUID();
    db.update(
        "insert into payments.gateways(id,name,provider,currency,enabled) values (?,?,?,?,?)",
        id,
        g.name(),
        g.provider(),
        g.currency(),
        g.enabled());
    return Map.of("id", id);
  }

  @PutMapping("/{id}")
  public void update(@PathVariable UUID id, @Valid @RequestBody Gateway g) {
    validate(g);
    if (db.update(
            "update payments.gateways set name=?,provider=?,currency=?,enabled=? where id=?",
            g.name(),
            g.provider(),
            g.currency(),
            g.enabled(),
            id)
        == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment method not found");
  }

  @DeleteMapping("/{id}")
  public void delete(@PathVariable UUID id) {
    if (db.update("delete from payments.gateways where id=?", id) == 0)
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment method not found");
  }

  @PostMapping("/{id}/test")
  public Map<String, Object> test(@PathVariable UUID id) {
    var gateway = db.queryForList("select provider from payments.gateways where id=?", id);
    if (gateway.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment method not found");
    providers.test(gateway.get(0).get("provider").toString());
    return Map.of("message", "Sandbox credentials verified");
  }
}
