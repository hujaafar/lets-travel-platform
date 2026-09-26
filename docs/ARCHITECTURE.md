# Architecture and consistency

## Boundaries

| Component | Responsibility | Persistent data |
|---|---|---|
| Identity | Accounts, roles, credentials, session verification | `identity` schema |
| Travel | Itineraries, stops, participants, graph projection | `travel` schema and Neo4j |
| Payments | Gateway metadata and sandbox connectivity | `payments` schema |
| Caddy/dashboard | TLS ingress, service routing, static application | None |
| Vault and agents | Scoped configuration delivery | Raft volume and per-service runtime volumes |

Services are separate Spring Boot processes and independently packaged images. Caddy discovers container DNS records and balances requests among replicas. No application session lives only in an individual replica. Internal session verification returns the current account role and status on every request, so suspension and deletion take effect immediately.

## Deliberate database tradeoff

A single PostgreSQL cluster hosts three ownership-separated schemas. Cross-schema foreign keys connect participants to users and transaction references to users, trips, and methods. This is an intentional compromise: the assignment requires correct cascading behavior, and a single SQL transaction offers that guarantee without pretending that cross-database cascades are available.

Runtime users have DML access only within their own schema. Schema/table owners are separate `NOLOGIN` roles. Deployments initialize and migrate with a privileged administration connection inside the PostgreSQL container. Runtime services cannot create or drop tables.

For independently operated databases, replace cross-schema references with stable IDs and durable lifecycle events, then introduce an explicit deletion saga. That would change the consistency contract and should be reviewed as a separate architectural change.

## Travel consistency

The parent, stops, participants, and outbox event are written in one PostgreSQL transaction. A stale `version` is rejected with HTTP 409. Replacing the stops is atomic; readers never see a partially saved itinerary.

A scheduled worker projects the latest SQL state into Neo4j. A PostgreSQL transaction-scoped advisory lock coordinates the workers across replicas, avoiding conflicting graph replacement. The worker deletes and rebuilds the affected `Travel` relationships inside a Neo4j transaction, then acknowledges its outbox event. A crash between those steps replays safely. Unreferenced destination nodes are cleaned up. PostgreSQL remains available when Neo4j is temporarily unavailable; the outbox retains unfinished work.

The destination graph is eventually consistent, and projection lag is visible at `GET /api/travels/graph-status`. The current worker serializes projection to favor correctness at the expected teaching-project scale. Higher throughput should partition work by travel ID with ordering guarantees.

## Limits and availability

The base Compose deployment runs two identity, travel, and payment replicas. The local profile runs one each. Caddy DNS discovery and passive upstream failure handling support replica replacement. This does not make a single laptop highly available: the databases, gateway and Vault remain single-node dependencies.

The production overlay supplies CloudNativePG, a three-member license-gated Neo4j template, three-node Vault Raft values and External Secrets inputs. The application base supplies three replicas, topology spread, disruption budgets, autoscaling and default-deny network policy. These assets render and pass configuration contracts; production certification still requires independent nodes, approved storage/DNS/certificates, supported auto-unseal, backup exercises and measured recovery targets. See `infra/kubernetes/README.md` and `docs/PRODUCTION-HA.md`.
