package com.travelplan.payments;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class PaymentTest {
  @Test
  void unsupportedProviderRejected() {
    assertThatThrownBy(
            () ->
                PaymentController.validate(
                    new PaymentController.Gateway("Other", "OTHER", "USD", false)))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void liveStripeKeysAreNeverAccepted() {
    assertThat(new ProviderClient("sk_live_example", "", "").configured("STRIPE")).isFalse();
  }

  @Test
  void missingCredentialsFailClearly() {
    assertThatThrownBy(() -> new ProviderClient("", "", "").test("PAYPAL"))
        .hasMessageContaining("sandbox credentials");
  }
}
