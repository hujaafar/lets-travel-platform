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
  final TravelController travels = mock(TravelController.class);
  final DiscoveryService discovery = mock(DiscoveryService.class);
  final PlatformController controller = new PlatformController(db, travels, discovery);
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

  @Test
  void completedParticipantCanPublishAndUpdateFeedback() {
    when(db.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(1);
    controller.feedback(new PlatformController.Feedback(id, 4, "  Great guide  "), user);
    verify(db)
        .update(
            contains("on conflict(travel_id,user_id)"),
            any(UUID.class),
            eq(id),
            eq(UUID.fromString(user.id())),
            eq(4),
            eq("Great guide"));
  }

  @Test
  void publicSuggestionsRejectExcessiveQueries() {
    assertThatThrownBy(() -> controller.suggest("x".repeat(101)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(controller.suggest("")).isEqualTo(List.of());
    verifyNoInteractions(discovery);
  }

  @Test
  void searchWithNoMatchesNeverQueriesAllTrips() {
    when(discovery.search("unknown")).thenReturn(List.of());
    assertThat(controller.explore("unknown")).isEqualTo(List.of());
    verifyNoInteractions(db);
  }

  @Test
  void managerListsOnlyOwnedJourneys() {
    var owner = UUID.fromString(user.id());
    var own = Map.<String, Object>of("id", id, "manager_id", owner);
    when(travels.list())
        .thenReturn(List.of(own, Map.of("id", UUID.randomUUID(), "manager_id", UUID.randomUUID())));
    assertThat(controller.owned(user)).isEqualTo(List.of(own));
  }

  @Test
  void administrativeListIncludesAllManagers() {
    var all = List.of(Map.<String, Object>of("id", id));
    when(travels.list()).thenReturn(all);
    var admin = new SessionUser(user.id(), user.name(), user.email(), "ADMIN", "csrf");
    assertThat(controller.owned(admin)).isEqualTo(all);
  }

  @Test
  void tripsWithPaymentHistoryCannotBeDeleted() {
    when(db.queryForList(anyString(), eq(id)))
        .thenReturn(List.of(Map.of("manager_id", UUID.fromString(user.id()))));
    when(db.queryForObject(anyString(), eq(Integer.class), eq(id))).thenReturn(1);
    assertThatThrownBy(() -> controller.delete(id, user))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("409");
    verify(travels, never()).delete(any());
  }

  @Test
  void unbookedOwnedTripCanBeDeleted() {
    when(db.queryForList(anyString(), eq(id)))
        .thenReturn(List.of(Map.of("manager_id", UUID.fromString(user.id()))));
    when(db.queryForObject(anyString(), eq(Integer.class), eq(id))).thenReturn(0);
    controller.delete(id, user);
    verify(travels).delete(id);
  }

  @Test
  void communityRejectsNonParticipants() {
    when(db.queryForObject(anyString(), eq(Integer.class), eq(id), any())).thenReturn(0);
    assertThatThrownBy(() -> controller.community(id, user))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("403");
    verify(db, never()).queryForList(startsWith("select distinct"), eq(id));
  }

  @Test
  void administratorCanResolveButNotInventReportStatuses() {
    var admin = new SessionUser(user.id(), user.name(), user.email(), "ADMIN", "csrf");
    when(db.update(anyString(), eq("REVIEWED"), eq("Handled"), eq(id))).thenReturn(1);
    controller.resolve(id, new PlatformController.Resolution("REVIEWED", "Handled"), admin);
    verify(db).update(contains("reviewed_at"), eq("REVIEWED"), eq("Handled"), eq(id));
    assertThatThrownBy(
            () ->
                controller.resolve(id, new PlatformController.Resolution("OPEN", "Ignored"), admin))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void missingManagerDoesNotExposeUnrelatedProfiles() {
    assertThatThrownBy(() -> controller.manager(id))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageContaining("404");
  }
}
