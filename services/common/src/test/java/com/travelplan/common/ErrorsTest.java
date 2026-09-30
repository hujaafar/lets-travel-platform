package com.travelplan.common;

import static org.assertj.core.api.Assertions.*;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.web.server.ResponseStatusException;

class ErrorsTest {
  final Errors errors = new Errors();

  @Test
  void expectedStatusErrorsHaveStableJsonMessages() {
    var response =
        errors.status(new ResponseStatusException(HttpStatus.NOT_FOUND, "Record not found"));
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    assertThat(response.getBody()).isEqualTo(Map.of("message", "Record not found"));
    assertThat(errors.status(new ResponseStatusException(HttpStatus.UNAUTHORIZED)).getBody())
        .isEqualTo(Map.of("message", "Request failed"));
  }

  @Test
  void validationErrorsAreReadableButMalformedBodiesAreNotEchoed() {
    assertThat(errors.invalid(new IllegalArgumentException("Invalid dates")).getBody())
        .isEqualTo(Map.of("message", "Invalid dates"));
    var response =
        errors.invalid(
            new HttpMessageNotReadableException(
                "private parser detail", new MockHttpInputMessage(new byte[0])));
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody().toString()).doesNotContain("private parser detail");
  }

  @Test
  void databaseConflictsDoNotLeakConstraintOrQueryDetails() {
    assertThat(errors.conflict().getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(errors.conflict().getBody())
        .isEqualTo(
            Map.of("message", "This record conflicts with existing data. Refresh and try again."));
  }
}
