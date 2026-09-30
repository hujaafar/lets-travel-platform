package com.travelplan.travel;

import static org.assertj.core.api.Assertions.*;

import jakarta.validation.Validation;
import jakarta.validation.constraints.NotNull;
import java.math.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class TravelValidationTest {
  TravelController.TravelInput input(
      LocalDate start, LocalDate end, String status, int capacity, List<UUID> participants) {
    return new TravelController.TravelInput(
        "Trip",
        start,
        end,
        status,
        BigDecimal.TEN,
        capacity,
        "Description",
        "bali",
        List.of(new TravelController.Stop("Ubud", "Indonesia", "Walk", "Hotel", "Car")),
        participants,
        0);
  }

  @Test
  void reversedDatesRejected() {
    assertThatThrownBy(
            () ->
                TravelController.validate(
                    input(
                        LocalDate.of(2026, 10, 3),
                        LocalDate.of(2026, 10, 1),
                        "DRAFT",
                        1,
                        List.of())))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void overCapacityRejected() {
    assertThatThrownBy(
            () ->
                TravelController.validate(
                    input(
                        LocalDate.now(),
                        LocalDate.now(),
                        "DRAFT",
                        1,
                        List.of(UUID.randomUUID(), UUID.randomUUID()))))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void sameDayTripAllowed() {
    assertThatCode(
            () ->
                TravelController.validate(
                    input(LocalDate.now(), LocalDate.now(), "DRAFT", 1, List.of())))
        .doesNotThrowAnyException();
  }

  @Test
  void nullItineraryStopsAreRejectedByRequestValidation() {
    var valid = input(LocalDate.now(), LocalDate.now(), "DRAFT", 1, List.of());
    var missingStop =
        new TravelController.TravelInput(
            valid.title(),
            valid.startDate(),
            valid.endDate(),
            valid.status(),
            valid.price(),
            valid.capacity(),
            valid.description(),
            valid.image(),
            Collections.singletonList(null),
            valid.participantIds(),
            valid.version());

    try (var factory = Validation.buildDefaultValidatorFactory()) {
      var validator = factory.getValidator();
      assertThat(validator.validate(valid)).isEmpty();
      assertThat(validator.validate(missingStop))
          .singleElement()
          .satisfies(
              violation -> {
                assertThat(violation.getPropertyPath().toString()).startsWith("stops[0]");
                assertThat(violation.getConstraintDescriptor().getAnnotation())
                    .isInstanceOf(NotNull.class);
              });
    }
  }
}
