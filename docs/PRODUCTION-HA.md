# Production HA and least-privilege deployment plan

The local Compose environment proves application replication, request distribution and Java replica recovery. The Kubernetes assets extend the design to a real multi-node platform without claiming that one laptop supplies independent failure domains.

## Required platform

- Three Kubernetes worker nodes across three zones, with a CNI that enforces NetworkPolicy.
- A redundant cloud load balancer and DNS health checks for the dashboard Service.
- CloudNativePG with three PostgreSQL instances, object-store WAL/backups and scheduled restore tests.
- Three Vault servers using integrated Raft, auto-unseal backed by the platform KMS, audit devices and tested snapshots.
- A licensed Neo4j Enterprise cluster with three members, encrypted Bolt and a restricted `travel_runtime` role limited to the Travel database and the projection operations documented below.
- External Secrets Operator authenticated through a dedicated Kubernetes role. Provider keys remain in Vault and are never stored in source or CI artifacts.

## Neo4j runtime role

Run these statements as a Neo4j administrator only after the Enterprise cluster and `travel` database exist. Substitute a password through the secret manager, not in the command history.

```cypher
CREATE ROLE travel_runtime IF NOT EXISTS;
GRANT ACCESS ON DATABASE travel TO travel_runtime;
GRANT MATCH {*} ON GRAPH travel NODES Travel TO travel_runtime;
GRANT MATCH {*} ON GRAPH travel NODES Destination TO travel_runtime;
GRANT MATCH {*} ON GRAPH travel RELATIONSHIPS VISITS TO travel_runtime;
GRANT CREATE ON GRAPH travel NODES Travel TO travel_runtime;
GRANT CREATE ON GRAPH travel NODES Destination TO travel_runtime;
GRANT CREATE ON GRAPH travel RELATIONSHIPS VISITS TO travel_runtime;
GRANT SET PROPERTY {*} ON GRAPH travel TO travel_runtime;
GRANT DELETE ON GRAPH travel NODES Travel TO travel_runtime;
GRANT DELETE ON GRAPH travel NODES Destination TO travel_runtime;
GRANT DELETE ON GRAPH travel RELATIONSHIPS VISITS TO travel_runtime;
```

Verify that the runtime user cannot administer users, roles, databases or configuration. Keep the local Community deployment for development; it cannot demonstrate this privilege boundary.

## Certification run

Capture timestamps, request success rates and recovery times for each event:

1. Drain and stop one application node while sustained authenticated reads and writes continue.
2. Terminate the PostgreSQL primary and confirm automatic promotion, transaction continuity and zero acknowledged-write loss.
3. Terminate the Vault leader and confirm a new leader plus continued secret refresh.
4. Terminate one Neo4j member and confirm projection writes and reads continue.
5. Remove one zone from load-balancer targets and confirm the public endpoint remains available.
6. Restore a backup into an isolated namespace and compare row, outbox and graph-projection counts.

The deployment is production-HA certified only when these tests run on independent infrastructure and the evidence is reviewed by a second person.
