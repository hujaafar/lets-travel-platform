package com.travelplan.payments;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class GatewayRulesTest {
  @Test
  void gatewayCurrencyMustBeOneOfTheSupportedCurrencies() {
    assertThatThrownBy(
            () ->
                PaymentController.validate(
                    new PaymentController.Gateway("Stripe", "STRIPE", "XYZ", true)))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("currencies");
  }

  @Test
  void bothPayPalCredentialsAreRequired() {
    assertThat(new ProviderClient("", "client", "").configured("PAYPAL")).isFalse();
    assertThat(new ProviderClient("", "", "secret").configured("PAYPAL")).isFalse();
    assertThat(new ProviderClient("", "client", "secret").configured("PAYPAL")).isTrue();
  }
}
