package com.travelplan.payments;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class GatewayFeatureTest {
  final JdbcTemplate db = mock(JdbcTemplate.class);
  final ProviderClient providers = mock(ProviderClient.class);
  final PaymentController controller = new PaymentController(db, providers);

  @Test
  void listingAddsConfigurationStatusWithoutReturningProviderSecrets() {
    var row = new HashMap<String, Object>(Map.of("id", UUID.randomUUID(), "provider", "STRIPE"));
    when(db.queryForList(anyString())).thenReturn(List.of(row));
    when(providers.configured("STRIPE")).thenReturn(true);
    assertThat(controller.list())
        .singleElement()
        .satisfies(
            gateway ->
                assertThat(gateway)
                    .containsEntry("configured", true)
                    .containsEntry("mode", "SANDBOX"));
  }

  @Test
  void createsAnIdentifiableGatewayWithTheSelectedSettings() {
    var id =
        controller
            .create(new PaymentController.Gateway("Card payments", "STRIPE", "EUR", false))
            .get("id");
    assertThat(id).isInstanceOf(UUID.class);
    verify(db)
        .update(
            startsWith("insert into payments.gateways"),
            eq(id),
            eq("Card payments"),
            eq("STRIPE"),
            eq("EUR"),
            eq(false));
  }

  @Test
  void updateAndDeleteApplyOnlyToTheRequestedGateway() {
    var id = UUID.randomUUID();
    when(db.update(anyString(), any(Object[].class))).thenReturn(1);
    controller.update(id, new PaymentController.Gateway("Wallet", "PAYPAL", "GBP", true));
    verify(db)
        .update(
            startsWith("update payments.gateways"),
            eq("Wallet"),
            eq("PAYPAL"),
            eq("GBP"),
            eq(true),
            eq(id));
    controller.delete(id);
    verify(db).update("delete from payments.gateways where id=?", id);
  }

  @Test
  void absentGatewaysCannotBeUpdatedDeletedOrTested() {
    var id = UUID.randomUUID();
    for (var operation :
        List.<Runnable>of(
            () ->
                controller.update(
                    id, new PaymentController.Gateway("Card", "STRIPE", "USD", false)),
            () -> controller.delete(id),
            () -> controller.test(id))) {
      assertThatThrownBy(operation::run)
          .isInstanceOfSatisfying(
              ResponseStatusException.class,
              error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }
    verifyNoInteractions(providers);
  }

  @Test
  void connectionTestUsesTheStoredProviderAndPropagatesFailure() {
    var id = UUID.randomUUID();
    when(db.queryForList(anyString(), eq(id))).thenReturn(List.of(Map.of("provider", "PAYPAL")));
    assertThat(controller.test(id)).containsEntry("message", "Sandbox credentials verified");
    verify(providers).test("PAYPAL");
    doThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Missing credentials"))
        .when(providers)
        .test("PAYPAL");
    assertThatThrownBy(() -> controller.test(id))
        .isInstanceOfSatisfying(
            ResponseStatusException.class,
            error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
  }
}
