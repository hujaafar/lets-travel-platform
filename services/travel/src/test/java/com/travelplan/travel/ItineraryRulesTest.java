package com.travelplan.travel;

import static org.assertj.core.api.Assertions.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class ItineraryRulesTest {
  @Test
  void externalImageUrlsAreNotAcceptedAsAssetIdentifiers() {
    var input =
        new TravelController.TravelInput(
            "Trip",
            LocalDate.now(),
            LocalDate.now(),
            "DRAFT",
            BigDecimal.TEN,
            1,
            "",
            "https://untrusted.example/tracker",
            List.of(),
            List.of(),
            0);
    assertThatThrownBy(() -> TravelController.validate(input))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("image");
  }
}
