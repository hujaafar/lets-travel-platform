package com.travelplan.travel;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.travelplan.common.SessionUser;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class PlatformRulesTest {
  final JdbcTemplate db = mock(JdbcTemplate.class);
  final PlatformController controller =
      new PlatformController(db, mock(TravelController.class), mock(DiscoveryService.class));
  final UUID id = UUID.randomUUID();
  final SessionUser user =
      new SessionUser(UUID.randomUUID().toString(), "Test", "t@example.test", "TRAVELER", "csrf");

  @Test
  void feedbackRequiresCompletedParticipation() {
    when(db.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(0);
    assertThatThrownBy(
            () -> controller.feedback(new PlatformController.Feedback(id, 5, "Lovely"), user))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("403");
    verify(db, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void managerCannotEditAnotherManagersJourney() {
    when(db.queryForList(anyString(), eq(id)))
        .thenReturn(List.of(Map.of("manager_id", UUID.randomUUID())));
    assertThatThrownBy(() -> controller.own(id, user))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("403");
  }

  @Test
  void travelersCannotModerateReports() {
    assertThatThrownBy(
            () ->
                controller.resolve(
                    id, new PlatformController.Resolution("REVIEWED", "Handled"), user))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("403");
    verifyNoInteractions(db);
  }

  @Test
  void reportMustIdentifyATarget() {
    assertThatThrownBy(
            () -> controller.report(new PlatformController.Report(null, null, "A concern"), user))
        .isInstanceOf(IllegalArgumentException.class);
    verifyNoInteractions(db);
  }

  @Test
  void cannotReportYourself() {
    assertThatThrownBy(
            () ->
                controller.report(
                    new PlatformController.Report(UUID.fromString(user.id()), null, "A concern"),
                    user))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
