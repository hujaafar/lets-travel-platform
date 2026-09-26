# Infrastructure evidence before submission

> Delivery update: the owner authorized a documented solo-maintainer merge exception on 17 September 2026. See [SOLO-MAINTAINER-DELIVERY.md](SOLO-MAINTAINER-DELIVERY.md). Approval and merge statements below are the earlier audit snapshot; use the linked PRs for actual current status.

The scripts below turn the outstanding infrastructure checks into repeatable gates. Their presence is not evidence that a deployment, failure test, or Jenkins run has passed. Keep the emitted JSON with the submitted revision and distinguish configuration checks from live results.

## Configuration and provisioning

```powershell
python scripts/verify-manifests.py --report work/verification/manifests.json
python -m unittest discover -s scripts/tests -v
```

The manifest check resolves the base, laptop, tools and build-only Compose models with placeholder values and an empty environment file. It does not read provisioning secrets, contact the Docker daemon, pull images or start services. It checks image/build consistency, replica declarations, loopback ports, internal networks, Bolt TLS and the current Jenkins PR/main boundaries. These are configuration contracts, not a Groovy compiler or a complete security review.

If `ansible-playbook` and the declared collection are installed, it also executes an actual `ansible-playbook --syntax-check` using the documentation inventory. Use `--require-ansible` in CI to reject a skipped syntax check, or `--ansible /path/to/ansible-playbook` to select an existing executable. Syntax checking does not contact or deploy to inventory hosts. The isolated permission tests run against temporary fixtures; POSIX assertions require a native Linux filesystem and are explicitly skipped by Windows Python.

## Authenticated requests and centralized logging

Run this on the already started local review deployment, after starting the monitoring profile through the documented operations procedure:

```powershell
python scripts/verify-logging.py --report work/verification/logging.json
```

The probe signs in over CA-verified internal HTTPS, makes read-only travel/payment requests, and signs out. It asserts that each generated request ID appears in the target service and in identity's `/internal/session` log. It then queries Loki over verified TLS and requires both correlated records to appear there. No provider requests or business-record changes are made. Loki currently relies on its private, unpublished monitoring network; its HTTP API has no separate account authentication. Application requests use real session authentication and CSRF-protected login/logout.

`--service-logs-only` explicitly omits the Loki gate when monitoring is unavailable; the report marks this omission. It must not be presented as centralized-ingestion evidence. All live probes use the already cached `python:3.13-alpine` image with `--pull=never`, receive credentials over stdin, and mount only the public CA. The default login uses the existing local bootstrap account. If its password has changed, `--credentials` accepts a private JSON file containing `email` and `password`; do not put passwords in command-line arguments. The generated report contains request IDs and results, not passwords, cookies, response data or raw logs.

## Java replica continuity

First use a dedicated review environment with two healthy replicas of **each** Java service. The laptop override has one replica and is deliberately rejected. Without the opt-in flag, this script does not contact Docker or change anything:

```powershell
python scripts/verify-failover.py
python scripts/verify-failover.py --run-failover --report work/verification/failover.json
```

The opted-in test establishes an authenticated baseline, then stops exactly one existing identity, travel or payments replica at a time. It measures transient failed requests and recovery time, requires three consecutive successful rounds across all three authenticated endpoints, then requires another eighteen successful reads. The default recovery deadline is 45 seconds; change it explicitly with `--recovery-timeout`. Passing proves the declared bounded continuity behavior, not zero failed requests during disruption.

Every stop enters a `finally` restoration path, including failed stops and ordinary interruption. The test restarts the exact container and waits for its health check before moving to the next service. A failure is recorded even if restoration succeeds. The report writes each selected container ID before stopping it and records whether restoration completed. An operating-system crash or forced process kill cannot execute Python cleanup: if that occurs, use the reported ID with `docker start <container-id>` and verify its health before continuing. The scripts never stop databases, recreate application containers, remove application volumes, change replica counts, or provision accounts. Login creates only the temporary verification session; normal session expiry applies if logout cannot complete.

## Availability and privilege requirements still needing an owner/environment

| Area | Supplied behavior | Requirement that remains |
| --- | --- | --- |
| Java services | Two instances per service in base Compose, Caddy DNS discovery, passive upstream failure handling, shared sessions; explicit failure probe | The probe has run; retain its final report. A successful local test still cannot prove host-level availability. |
| PostgreSQL | Containerized single primary, TLS, private network, separate schema/runtime roles | Add a reviewed standby/failover design on independent hosts, promotion/fencing, backup and restore tests, and agreed recovery targets. Multiple containers sharing the existing data directory are not a replication design. PostgreSQL provides standby replication primitives; production orchestration and recovery procedures must be selected and demonstrated. [PostgreSQL standby documentation](https://www.postgresql.org/docs/current/warm-standby.html). |
| Neo4j | Community instance, verified Bolt TLS, private network, PostgreSQL outbox rebuild source | Community is intended for single-instance use; clustering and granular RBAC need a supported Enterprise/Aura offering and owner-approved terms/resources. The current graph writer uses the administrative account. Creating a differently named Community user would still imply administrator privileges, so it does not resolve least privilege. No license was accepted and no database was replaced. [Neo4j editions](https://neo4j.com/docs/operations-manual/current/introduction/), [user privileges](https://neo4j.com/docs/operations-manual/current/authentication-authorization/manage-users/). |
| Vault | One Raft node, TLS, per-service AppRole policies; operator files protected locally | Provision a multi-node quorum across failure domains, supported unseal/key custody, secret rotation and restore evidence. One node with Raft enabled remains a single point of failure. [Vault reference architecture](https://developer.hashicorp.com/well-architected-framework/zero-trust-security/raft-reference-architecture). |
| Ingress | One Caddy instance, loopback HTTPS, balanced Java upstreams | Redundant ingress plus a real load balancer/DNS and trusted certificate operation on independent hosts. Extra Java replicas cannot compensate for loss of the sole gateway or Docker host. |
| Jenkins and review | Pipeline source, isolated build model, unit/config checks, main-only Community Sonar gate, protected deployment stage | The local candidate pipeline passed. Active development has moved to GitHub PR #1 with enforced `travel-plan/jenkins` and `travel-plan/live-tests` checks plus one approval. The GitHub workflow executes a fresh Jenkins/Sonar candidate analysis on each PR; inspect its current result and obtain independent approval. Fresh candidate analysis has no persistent new-code baseline or native Sonar PR decoration. Production deployment still needs its own target and credentials. |
| Ansible | Ubuntu 22.04/24.04 package recipe, private deployment directory, Compose provisioning | The separate WSL-to-Windows workstation playbook deployed successfully. The Ubuntu server package-installation recipe still requires an independent supported host. |

On 17 September the user allocated Docker to Travel Plan. The fresh two-replica deployment, live TLS/database tests, local Jenkins review and Sonar analysis, workstation Ansible deployment, centralized ingestion and replica probes have now been executed. PostgreSQL and Vault backups were restored into isolated test instances. On 20 September, the Kubernetes base and production operator inputs were added and validated by Kustomize plus 54 configuration contracts. See FINAL-AUDIT.md and PRODUCTION-HA.md for final measurements and the independent-node certification runbook. Docker's earlier uninstall lost the old database disk; these are checks of the newly initialized records, not recovery of the pre-uninstall data.

Use `python scripts/start.py` for sequential builds, staged bootstrap and bounded
runtime readiness. Set `BUILD_CA_FILE` only when an approved organization CA bundle
is needed for package downloads; the startup command chooses the optional build
overlay automatically. `--replicas 2` selects the base replicated deployment.
Do not run replica failure tests until that deployment is healthy. CLI timeouts
terminate only the launched command tree; they do not reset Docker or stop other
projects. The failover runner retains ownership of its restoration procedure.
