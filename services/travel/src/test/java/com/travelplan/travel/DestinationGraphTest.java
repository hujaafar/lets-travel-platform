package com.travelplan.travel;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.neo4j.driver.*;
import org.springframework.jdbc.core.JdbcTemplate;

class DestinationGraphTest {
  final JdbcTemplate db = mock(JdbcTemplate.class);
  final Driver driver = mock(Driver.class);
  final Session session = mock(Session.class);
  final TransactionContext transaction = mock(TransactionContext.class);
  final UUID id = UUID.randomUUID();
  final DestinationGraph graph = new DestinationGraph(db, driver);

  @BeforeEach
  @SuppressWarnings("unchecked")
  void configureDriver() {
    when(db.queryForObject(anyString(), eq(Boolean.class))).thenReturn(true);
    when(db.queryForList(startsWith("select id,travel_id")))
        .thenReturn(List.of(Map.of("id", 1L, "travel_id", id)));
    when(driver.session()).thenReturn(session);
    var result = mock(Result.class);
    when(transaction.run(anyString(), anyMap())).thenReturn(result);
    when(transaction.run(anyString())).thenReturn(result);
    when(session.executeWrite(any(TransactionCallback.class)))
        .thenAnswer(call -> ((TransactionCallback<?>) call.getArgument(0)).execute(transaction));
  }

  @Test
  void aReplicaWithoutTheAdvisoryLockDoesNoProjectionWork() {
    when(db.queryForObject(anyString(), eq(Boolean.class))).thenReturn(false);
    graph.project();
    verifyNoInteractions(driver);
    verify(db, never()).queryForList(anyString());
  }

  @Test
  void successfulProjectionUsesLatestTravelAndOrderedDestinationsBeforeAcknowledging() {
    when(db.queryForList(startsWith("select title"), eq(id)))
        .thenReturn(List.of(Map.of("title", "Latest title")));
    when(db.queryForList(startsWith("select destination"), eq(id)))
        .thenReturn(
            List.of(
                Map.of("destination", "Ubud", "country", "Indonesia"),
                Map.of("destination", "Uluwatu", "country", "Indonesia")));
    graph.project();
    verify(transaction)
        .run(
            startsWith("CREATE (t:Travel"),
            eq(Map.of("id", id.toString(), "title", "Latest title")));
    verify(transaction)
        .run(
            startsWith("MERGE (d:Destination"),
            eq(Map.of("id", id.toString(), "name", "Ubud", "country", "Indonesia", "position", 0)));
    verify(transaction)
        .run(
            startsWith("MERGE (d:Destination"),
            eq(
                Map.of(
                    "id",
                    id.toString(),
                    "name",
                    "Uluwatu",
                    "country",
                    "Indonesia",
                    "position",
                    1)));
    var ordered = inOrder(session, db);
    ordered.verify(session).executeWrite(any(TransactionCallback.class));
    ordered.verify(db).update("delete from travel.graph_outbox where id=?", 1L);
    verify(session).close();
  }

  @Test
  void aNeo4jFailureLeavesTheOutboxEventAvailableForRetry() {
    when(session.executeWrite(any(TransactionCallback.class)))
        .thenThrow(new IllegalStateException("graph offline"));
    assertThatCode(graph::project).doesNotThrowAnyException();
    verify(db, never()).update(anyString(), any(Object[].class));
    verify(session).close();
  }

  @Test
  void deletedTravelsRemoveTheirGraphAndOrphanedDestinations() {
    graph.project();
    verify(transaction)
        .run("MATCH (t:Travel {id:$id}) DETACH DELETE t", Map.of("id", id.toString()));
    verify(transaction, never()).run(startsWith("CREATE"), anyMap());
    verify(transaction).run("MATCH (d:Destination) WHERE NOT (d)<-[:VISITS]-() DELETE d");
    verify(db).update("delete from travel.graph_outbox where id=?", 1L);
  }

  @Test
  void replayReplacesTheProjectionFromCurrentSqlStateInsteadOfAppendingDuplicateTravels() {
    when(db.queryForList(startsWith("select title"), eq(id)))
        .thenReturn(
            List.of(Map.of("title", "Earlier title")), List.of(Map.of("title", "Changed title")));
    graph.project();
    graph.project();
    var ordered = inOrder(transaction);
    ordered
        .verify(transaction)
        .run("MATCH (t:Travel {id:$id}) DETACH DELETE t", Map.of("id", id.toString()));
    ordered
        .verify(transaction)
        .run(
            startsWith("CREATE (t:Travel"),
            eq(Map.of("id", id.toString(), "title", "Earlier title")));
    ordered.verify(transaction).run("MATCH (d:Destination) WHERE NOT (d)<-[:VISITS]-() DELETE d");
    ordered
        .verify(transaction)
        .run("MATCH (t:Travel {id:$id}) DETACH DELETE t", Map.of("id", id.toString()));
    ordered
        .verify(transaction)
        .run(
            startsWith("CREATE (t:Travel"),
            eq(Map.of("id", id.toString(), "title", "Changed title")));
  }
}
