# Assignment audit — 20 September 2026

This audit checks the supplied Travel-Plan Part 1 rubric. **The project is not fully complete against the strict wording.** Source implementation, automated evidence and infrastructure/account prerequisites are different statuses.

Baseline inspected: `62a947db2aca25d2e93e3887fa677c0bb08b0ab6` on `main`. [Its GitHub workflow](https://github.com/hujaafar/travel-plan/actions/runs/35206087570) completed successfully for both `travel-plan/jenkins` and `travel-plan/live-tests`. PR #1 was merged on 17 September; older documents calling it open are historical snapshots. [PR #2](https://github.com/hujaafar/travel-plan/pull/2) is now merged as well (commit `d8b780f889125b1701c53e089756a6095fb34566`, [checks passed on `main`](https://github.com/hujaafar/travel-plan/actions/runs/35429920193)), and synced to an identical tree on the course Gitea repository. The findings below describe what PR #2 fixed; treat its "Baseline defect fixed in PR #2" rows as now reflecting `main`, not an open PR.

## Requirement-by-requirement findings

| Requirement | Finding and evidence |
| --- | --- |
| Business-domain boundaries | Implemented: Identity owns accounts/sessions; Travel owns itineraries/participants/graph projection; Payments owns gateway administration. See `docs/ARCHITECTURE.md`. |
| Independent service deployment and scaling | Separate Spring Boot images and replica counts exist. **Partial independence:** shared PostgreSQL, cross-schema foreign keys and synchronous Identity calls couple services. Independent image scaling does not eliminate these dependencies. |
| Replicas, load balancing and failover | Base Compose declares two replicas of each Java service; Caddy discovers replicas and balances requests. The laptop override deliberately runs one. Existing CI measures one-replica loss. PR #2 adds concurrent requests, latency thresholds and log-based proof that both replicas serve requests. |
| Functionality during failures | A surviving Java replica supports recovery; an unavailable Neo4j delays projection without making SQL CRUD depend on graph availability. **Not whole-system HA:** all Identity replicas failing prevents authenticated business requests; PostgreSQL, gateway, Vault and host failures remain important dependencies. |
| API gateway | Implemented by Caddy in `infra/Caddyfile`, including TLS routing and a private session-verification listener. |
| Trace a request across services | Request IDs are validated, returned, forwarded to Identity and logged. `verify-logging.py` checks correlation and centralized Loki ingestion. |
| Explain and execute Ansible | `deploy.yml` validates Ubuntu/input, installs prerequisites, loads source, bootstraps PKI/Vault, then deploys databases, agents and replicas. CI executes it on Ubuntu with existing packages. The bare-host package installation path still needs a matching clean host. |
| Safe Ansible rerun | Bootstrap preserves durable credentials/data but rotates AppRole credentials. It is deliberately reported changed, not falsely advertised as zero-change idempotence. PR #2 reapplies the full playbook and checks unchanged business records and a surviving authenticated session. This does not claim zero interruption during redeployment. |
| Docker provisioning | Container images, internal networking, persistent volumes, health checks and build-only configuration exist. Existing live CI is evidence of a working disposable deployment. |
| Admin-only APIs | **Baseline defect fixed in PR #2:** all business reads and mutations now require ADMIN. VIEWER and TRAVEL_MANAGER are still assignable roles but cannot access the Part 1 admin workspace. Login, own-session inspection/logout, private health and service verification are necessary exceptions. |
| User/traveler/travel/payment CRUD | User, travel and gateway CRUD exist. Travelers are users assigned through `travel.participants`, not a separate traveler-profile aggregate. The wording uses both “travelers” and “travels”; verify that this model matches the evaluator's intended entity. No passport/traveler-profile fields are specified by the brief. |
| Itinerary details | Multiple ordered stops, dates, computed inclusive duration, activities, accommodation and transportation persist. Version checks reject stale edits. |
| Cascading operations | SQL cascades handle stops, memberships and sessions; transaction references become null. Graph outbox handles asynchronous graph deletion. IDs are immutable; no arbitrary primary-key update API is exposed. |
| Error handling | Validation/conflict/not-found/authentication/provider errors have explicit HTTP responses; exceptions roll back transactional travel updates. Existing tests cover these paths, not every possible input. |
| Authentication and authorization | BCrypt, hashed server-side session tokens, Secure/HttpOnly/SameSite cookies, CSRF/origin checks, login throttling and current-role verification are implemented. PR #2 adds a full role × method × business-endpoint filter matrix. |
| Stripe and PayPal | Gateway configuration, mocked provider HTTP tests and protected live sandbox checks exist. Owner Stripe test balance access and PayPal sandbox token issuance passed with secrets stored only in Vault. No payment operation was performed. |
| Responsive Chrome and Firefox | Existing live Playwright suite covers both browsers, phone dimensions, CRUD and accessibility. UI changes must pass the current PR suite; physical-device certification is not claimed. |
| Unit tests on PRs | GitHub PR workflow launches actual disposable Jenkins/Sonar and a separate live deployment job. Java, dashboard and Python tests run. Unit coverage of helpers is not evidence that every React interaction has a unit test; live E2E provides additional coverage. |
| Jenkins build/test/deploy | Jenkins runs Java/frontend/provisioning tests and Sonar. The separate live job builds and deploys with Ansible. Persistent staging deployment needs the owner's target and credentials. |
| Sonar quality and deprecated packages | Baseline job log explicitly reports `QUALITY GATE STATUS: PASSED`. This is not a claim of zero maintainability findings or absence of every dependency vulnerability. Inspect current sanitized Jenkins/Sonar artifacts for full scanner warnings and metrics. |
| PR workflow and human review | PR automation is implemented; both PR #1 and PR #2 were merged under a documented, standing solo-maintainer branch-protection policy (0 required approvals, required CI checks unchanged) — see [SOLO-MAINTAINER-DELIVERY.md](SOLO-MAINTAINER-DELIVERY.md). **No independent human review can be manufactured retroactively;** this remains a disclosed gap against the strict assignment wording, not a satisfied requirement. |
| Naming/structure/package justification | Domain packages, service modules, shared security code, TypeScript models and package decisions are documented. Controllers combine HTTP and JDBC orchestration; a larger system would benefit from service/repository separation. CamelCase/PascalCase applies to identifiers; descriptive PR titles are a separate convention. |
| TLS and internal access | Gateway/service/PostgreSQL/Bolt/Vault/provider transport is configured with TLS; internal ports are not published. CI verifies internal transport. Development certificates need a production renewal/trust plan before public deployment. |
| Secret management | Scoped Vault AppRoles and read-only rendered service configuration exist. Development bootstrap recovery material remains local and excluded from Git. Production custody/rotation/auto-unseal needs an operating environment. |
| Least privilege | ADMIN API access, distinct SQL runtime roles, Vault scopes and non-root Java containers are present. **Neo4j Community still uses its administrative account at the database layer** — that requires a commercially licensed Enterprise/Aura tier this project does not hold, so it is not fixable in Community edition. As a compensating control, `identity` and `payments` are no longer even attached to Neo4j's Docker/Kubernetes network; only `travel` (the sole caller) can resolve or reach it, verified live by `scripts/verify-infrastructure.py`. This is network-layer least privilege, not the database-native scoped role the strict wording implies. |
| Updates and vulnerability maintenance | Renovate and npm audit are configured; no claim that one green build proves all Java, image or OS dependencies are vulnerability-free. |
| Documentation bonus | API, architecture, schemas, operations, delivery, security and package decisions exist; this audit and the walkthrough below explain remaining limits. |
| Kubernetes bonus | Implemented under `infra/kubernetes`: three service replicas, topology spread, HPAs, disruption budgets, default-deny networking, External Secrets/Vault, CloudNativePG and license-gated Neo4j/Vault HA inputs. Kustomize rendering and 54 configuration contracts pass; actual multi-node certification remains external. |
| Integration/E2E bonus | Implemented in existing live CI. PR #2 adds load/distribution and reapplication evidence. |

## Changes in PR #2

1. Require ADMIN for every business API read and mutation, including graph status; deny non-admin dashboard entry.
2. Test denied Viewer and Travel Manager requests even with valid sessions/CSRF, alongside allowed Admin operations.
3. Add `scripts/verify-load.py`: four concurrent authenticated clients by default, three endpoints, healthy/one-replica-down/restored phases, per-path p95 and failure counts. Healthy phase requires requests to every replica. Failure phases permit a documented initial recovery interval, then require successful steady reads. Increase load on a dedicated environment to measure real capacity; the default is a bounded regression workload.
4. Add `scripts/verify-redeploy.py`: rerun Ansible on the disposable GitHub runner, compare business-table snapshots in memory and confirm an existing session still works. No table data or credential fingerprints are published.
5. Wire both gates into PR CI and add tests ensuring empty samples, late failures, slow responses and changed data cannot pass.

## What still requires a concrete environment or owner input

- Independent failure domains, redundant ingress and PostgreSQL/Vault/Neo4j availability design, provisioned and tested. Extra replicas on one laptop cannot establish host HA.
- A licensed Neo4j offering/configuration that supports database-native scoped runtime roles. Do not claim the Community admin account itself is least privilege — the network isolation added around it is a compensating control, not a substitute for a scoped role.
- Deployment of the supplied Kubernetes/HA assets on independent nodes, followed by failure and recovery measurements.
- Independent review/approval, and any persistent staging target/SSH credentials.
- If strict database independence is required, replace cross-schema FKs with owned stores, lifecycle events and a deletion/consistency workflow. This changes the current atomic cascading contract and must be designed and tested as an architectural migration, not represented as already implemented.

## Local verification for these edits

Dashboard build and all 63 frontend tests passed. Python ran 44 tests: 42 passed, two existing JDK-dependent tests skipped. Local Maven stopped before compilation in the environment that authored this PR because that workspace could not resolve `repo.maven.apache.org`; Docker was unavailable there. A separate later verification pass, from a workspace with working Maven/npm/Python access, re-ran `mvnw verify` (all Java tests across `common`/`identity`/`travel`/`payments` passed) and `npm run build && npm test` (63/63 dashboard tests passed) against this same branch before merge; Docker still was not running there, so the live/container checks were left to the required GitHub `travel-plan/live-tests` job, which passed on the merged commit.

## Review walkthrough

**Architecture:** “I separated identity, itinerary management and payment-gateway administration into independently packaged services. Caddy is the gateway. Each Java service normally has two replicas. PostgreSQL owns transactional data; Neo4j is an asynchronous destination projection. The shared database and live Identity verification are dependencies, so I do not claim complete service isolation.”

**Ansible deploy.yml:** Explain each task in execution order: OS/input assertions; optional package installation and Docker startup; source directory/archive checks; isolated Python dependencies; bootstrap certificates and Vault roles; database/agent deployment; application replicas; optional tools. `serial: 1` applies hosts sequentially. `no_log` protects bootstrap output. Bootstrap deliberately rotates AppRole credentials, so reruns can report changes; the regression gate checks data/session preservation rather than demanding `changed=0`.

**workstation.yml:** This is the existing-workstation path. Read its preflight assertions and deployment tasks too; it is a separate controller/host setup from clean Ubuntu provisioning. Explain why a successful Ubuntu pre-provisioned runner does not prove every clean-host installation path.

**CI:** “Opening/updating a PR starts two GitHub jobs. One provisions actual Jenkins and SonarQube for an isolated source review, then runs build/tests/coverage and waits for the quality gate. The other deploys a fresh application through Ansible, checks transport/logging, reruns deployment, performs browser/API tests and measures replica recovery/load. Evidence is archived per run.”

**Security:** Distinguish authentication (who owns a valid session), authorization (ADMIN on business APIs), CSRF/origin protection, TLS, internal service authentication, SQL/Vault privilege scopes and remaining Neo4j permissions. Show that a valid non-admin session receives 403, an absent session receives 401, and an Identity outage fails closed with 503.

**Databases:** Explain the tables and cascades in `docs/SCHEMA.md`. In Neo4j, `Travel` connects to `Destination` through ordered `VISITS` relationships. A SQL outbox records work in the same transaction as travel changes. A scheduled projector retries unfinished work; PostgreSQL remains the source of truth.

**Live demo:** Start the two-replica profile, sign in as Admin, exercise CRUD and invalid inputs, demonstrate a denied non-admin request, show a correlated request in service/Loki logs, run `python scripts/verify-load.py --run-load` on the disposable review stack, then inspect the JSON report and current PR checks. Do not describe a written test script as an executed result.
