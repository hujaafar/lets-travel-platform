package com.travelplan.travel;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;

class TravelFeatureTest {
  final JdbcTemplate db = mock(JdbcTemplate.class);
  final TrackingTransactions transactions = new TrackingTransactions();
  final TravelController controller;

  TravelFeatureTest() {
    var proxy = new ProxyFactory(new TravelController(db));
    proxy.setProxyTargetClass(true);
    proxy.addAdvice(
        new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
    controller = (TravelController) proxy.getProxy();
    when(db.update(anyString(), any(Object[].class))).thenReturn(1);
  }

  private TravelController.TravelInput input(List<UUID> people, int version) {
    return new TravelController.TravelInput(
        "Island journey",
        LocalDate.of(2027, 1, 2),
        LocalDate.of(2027, 1, 5),
        "DRAFT",
        BigDecimal.TEN,
        4,
        "A trip",
        "bali",
        List.of(
            new TravelController.Stop("Ubud", "Indonesia", "Walk", "Hotel", "Car"),
            new TravelController.Stop("Uluwatu", "Indonesia", "Beach", "Resort", "Car")),
        people,
        version);
  }

  @Test
  void creationSavesOrderedStopsUniqueMembershipsAndAnOutboxEventInOneTransaction() {
    var person = UUID.randomUUID();
    var id = (UUID) controller.create(input(List.of(person, person), 0)).get("id");
    verify(db)
        .update(
            startsWith("insert into travel.stops"),
            eq(id),
            eq(0),
            eq("Ubud"),
            eq("Indonesia"),
            eq("Walk"),
            eq("Hotel"),
            eq("Car"));
    verify(db)
        .update(
            startsWith("insert into travel.stops"),
            eq(id),
            eq(1),
            eq("Uluwatu"),
            eq("Indonesia"),
            eq("Beach"),
            eq("Resort"),
            eq("Car"));
    verify(db, times(1))
        .update("insert into travel.participants(travel_id,user_id) values (?,?)", id, person);
    verify(db).update("insert into travel.graph_outbox(travel_id) values (?)", id);
    assertThat(transactions.commits).isEqualTo(1);
    assertThat(transactions.rollbacks).isZero();
  }

  @Test
  void aChildPersistenceFailureRollsBackTheTransactionAndDoesNotEnqueueProjection() {
    when(db.update(startsWith("insert into travel.stops"), any(Object[].class)))
        .thenThrow(new DataIntegrityViolationException("Invalid child"));
    assertThatThrownBy(() -> controller.create(input(List.of(), 0)))
        .isInstanceOf(DataIntegrityViolationException.class);
    assertThat(transactions.rollbacks).isEqualTo(1);
    assertThat(transactions.commits).isZero();
    verify(db, never()).update(startsWith("insert into travel.graph_outbox"), any(Object[].class));
  }

  @Test
  void staleVersionsCannotReplaceStopsOrEnqueueAnEvent() {
    when(db.update(startsWith("update travel.travels"), any(Object[].class))).thenReturn(0);
    assertThatThrownBy(() -> controller.update(UUID.randomUUID(), input(List.of(), 3)))
        .isInstanceOfSatisfying(
            ResponseStatusException.class,
            error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    verify(db, never()).update(startsWith("delete from travel.stops"), any(Object[].class));
    verify(db, never()).update(startsWith("insert into travel.graph_outbox"), any(Object[].class));
    assertThat(transactions.rollbacks).isEqualTo(1);
  }

  @Test
  void aMatchingVersionReplacesChildrenAndProjectsTheUpdatedRecord() {
    var id = UUID.randomUUID();
    controller.update(id, input(null, 7));
    verify(db)
        .update(
            contains("version=version+1"),
            eq("Island journey"),
            any(),
            any(),
            eq("DRAFT"),
            eq(BigDecimal.TEN),
            eq(4),
            eq("A trip"),
            eq("bali"),
            eq(id),
            eq(7));
    verify(db).update("delete from travel.participants where travel_id=?", id);
    verify(db).update("insert into travel.graph_outbox(travel_id) values (?)", id);
    assertThat(transactions.commits).isEqualTo(1);
  }

  @Test
  void deletingAnExistingTravelEnqueuesItsRemovalAtomically() {
    var id = UUID.randomUUID();
    controller.delete(id);
    var ordered = inOrder(db);
    ordered.verify(db).update("delete from travel.travels where id=?", id);
    ordered.verify(db).update("insert into travel.graph_outbox(travel_id) values (?)", id);
    assertThat(transactions.commits).isEqualTo(1);
  }

  @Test
  void deletingAnAbsentTravelDoesNotPublishAFictitiousDeletion() {
    when(db.update(startsWith("delete from travel.travels"), any(Object[].class))).thenReturn(0);
    assertThatThrownBy(() -> controller.delete(UUID.randomUUID()))
        .isInstanceOfSatisfying(
            ResponseStatusException.class,
            error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    verify(db, never()).update(startsWith("insert into travel.graph_outbox"), any(Object[].class));
    assertThat(transactions.rollbacks).isEqualTo(1);
  }

  @Test
  void travelReadIncludesOrderedChildrenMembershipAndInclusiveDuration() {
    var id = UUID.randomUUID();
    var secondId = UUID.randomUUID();
    var row =
        new HashMap<String, Object>(
            Map.of(
                "id",
                id,
                "start_date",
                java.sql.Date.valueOf("2027-01-02"),
                "end_date",
                java.sql.Date.valueOf("2027-01-05")));
    var second =
        new HashMap<String, Object>(
            Map.of(
                "id",
                secondId,
                "start_date",
                java.sql.Date.valueOf("2027-01-02"),
                "end_date",
                java.sql.Date.valueOf("2027-01-02")));
    var stops =
        List.<Map<String, Object>>of(
            Map.of("destination", "Ubud"), Map.of("destination", "Uluwatu"));
    var person = UUID.randomUUID();
    when(db.queryForList(startsWith("select *"))).thenReturn(List.of(row, second));
    when(db.queryForList(startsWith("select travel_id,destination")))
        .thenReturn(
            List.of(
                Map.of("travel_id", id, "destination", "Ubud"),
                Map.of("travel_id", id, "destination", "Uluwatu"),
                Map.of("travel_id", secondId, "destination", "Tokyo")));
    when(db.queryForList(startsWith("select travel_id,user_id")))
        .thenReturn(List.of(Map.of("travel_id", id, "user_id", person)));
    var result = controller.list();
    assertThat(result).hasSize(2);
    assertThat(result.get(0))
        .containsEntry("id", id)
        .containsEntry("duration", 4L)
        .containsEntry("stops", stops)
        .containsEntry("participantIds", List.of(person));
    assertThat(result.get(1))
        .containsEntry("id", secondId)
        .containsEntry("duration", 1L)
        .containsEntry("stops", List.of(Map.of("destination", "Tokyo")))
        .containsEntry("participantIds", List.of());
    verify(db, times(3)).queryForList(anyString());
    verify(db, never()).queryForList(anyString(), any(Object[].class));
    assertThat(transactions.definition.getIsolationLevel())
        .isEqualTo(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    assertThat(transactions.definition.isReadOnly()).isTrue();
    assertThat(transactions.commits).isEqualTo(1);
    assertThat(transactions.rollbacks).isZero();
    when(db.queryForObject(contains("graph_outbox"), eq(Integer.class))).thenReturn(2);
    assertThat(controller.graphStatus()).containsEntry("pending", 2);
  }

  @Test
  void anEmptyCatalogueDoesNotQueryUnrelatedChildTables() {
    assertThat(controller.list()).isEmpty();
    verify(db, times(1)).queryForList(anyString());
  }

  // Exercises the real Spring transaction interceptor. PostgreSQL rollback and
  // cross-schema FK effects still require the separate live integration suite.
  static class TrackingTransactions extends AbstractPlatformTransactionManager {
    int commits, rollbacks;
    TransactionDefinition definition;

    protected Object doGetTransaction() {
      return new Object();
    }

    protected void doBegin(Object transaction, TransactionDefinition definition) {
      this.definition = definition;
    }

    protected void doCommit(DefaultTransactionStatus status) {
      commits++;
    }

    protected void doRollback(DefaultTransactionStatus status) {
      rollbacks++;
    }
  }
}
