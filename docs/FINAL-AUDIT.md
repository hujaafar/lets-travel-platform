# Travel Plan — submission audit

> Current rubric review: see [REQUIREMENTS-AUDIT.md](REQUIREMENTS-AUDIT.md). GitHub PRs through [PR #5](https://github.com/hujaafar/travel-plan/pull/5) are merged and synced to an identical source tree on the course Gitea repository. Measurements below the next paragraph are the September 17 historical snapshot; use the current PR run and completion handoff for final status.
> Delivery update: the owner authorized a documented, standing solo-maintainer branch-protection policy on 17 September 2026, applied to both merges. See [SOLO-MAINTAINER-DELIVERY.md](SOLO-MAINTAINER-DELIVERY.md). Approval and merge statements below are the earlier audit snapshot; use the linked PRs for actual current status.

17 September 2026 (historical snapshot; see above for current merge state). **The local application and candidate CI review are verified.** The local measurements below are historical evidence, not a replacement for current cloud checks on the merged `main`. Owner Stripe and PayPal sandbox checks passed on 20 September. Independent approval, licensed Neo4j runtime least privilege and deployed multi-node HA certification remain open. This report is not an independent human approval.

## Executed checks

| Check | Observed result |
| --- | --- |
| Java | 78 tests passed; no failures, errors or skips. JaCoCo: 439/456 lines (96.3%), 158/176 branches (89.8%). |
| Dashboard | 63 unit tests, TypeScript/Vite production build and formatting passed; npm audit reported zero vulnerabilities. |
| Provisioning | All 29 tests passed on the native Linux Jenkins agent, including POSIX permissions; Windows previously passed 24 with five explicit skips. |
| Deployment configuration | 38 contracts and actual Ansible syntax passed. |
| Jenkins | Local candidate job `travel-plan-local-review`, build 6: SUCCESS. Dedicated unprivileged agent; controller has zero executors. |
| SonarQube | Candidate gate passed with no ignored conditions: zero bugs, vulnerabilities and hotspots; 0% duplicated lines. 94 existing maintainability findings remain. Combined coverage is 49.8%; frontend LCOV is not imported. |
| Live Chrome | All seven scenarios passed together, including two direct database fixtures. |
| Live Firefox | All five workspace/UI/API scenarios passed under WSL. The two direct database fixtures ran through Windows Chrome. |
| Live infrastructure | HTTPS for all services/gateway, anonymous rejection, private session listener authentication, public internal-path rejection, PostgreSQL least-privilege roles and plaintext rejection, verified Bolt TLS and matching graph projection passed. |
| Ansible deployment | The WSL workstation playbook actually deployed two Java replicas per service and ran the infrastructure verifier. The separate Ubuntu server installation recipe is syntax-checked only. |
| Logging | Correlated travel-to-identity and payments-to-identity requests appeared in centralized Loki over verified TLS. |
| Recovery | Fresh PostgreSQL dump restored into an isolated temporary database; Vault snapshot restored into an isolated temporary instance, verifying the original unseal key/token, all three service records and scoped policies. |
| Portable design | Refreshed preview passed motion, five widths, six screens, local CRUD/persistence/export, no external requests and automated accessibility checks. Shared logo/design and always-enabled motion remain. |

The historical local CI run analyzed committed application revision `5380cfe659520ccf6cb49b096a534b8ab2d25fe1`. Its runtime/browser checks include Caddy correction `65b44133285224388669be1db0c8e5994cd823ae`; changes through the earlier handoff `53c7d71` were documentation. The later GitHub workflow, CI safety tests and Vault memory corrections are covered by separate cloud runs, each recording its own source SHA. Each raw local run records its revision and dirty state. Earlier failed attempts remain in evidence and are superseded only by named successful reruns.

The local CI job consumes a verified Git archive, not a Git-host PR event. It has no SCM blame, deployment credentials or application Docker socket. Its Sonar gate preserves Sonar way conditions and adds whole-project zero-bug/zero-vulnerability and maximum 3% duplication conditions. Java and dashboard sources were analyzed; this is not whole-stack dependency or infrastructure security clearance.

## Measured Java replica failover

The probe stopped one replica at a time, required three successful recovery rounds and eighteen additional stable reads, then restored the replica and verified health.

| Service | Requests | Transient failures | Measured recovery | Restored |
| --- | ---: | ---: | ---: | --- |
| identity | 30 | 1 | 7.21 s | Yes |
| travel | 27 | 0 | 2.20 s | Yes |
| payments | 27 | 0 | 2.24 s | Yes |

The first identity probe took 30.87 seconds with eight failed requests. An unpublished Caddy listener now balances read-only session verification across identity replicas; temporary authentication dependency failures return 503 without clearing the browser session. Java clients without SNI receive the existing correct certificate, while hostname/CA validation stays enabled. The final measurement above supersedes the earlier result. This test establishes bounded Java replica recovery, not zero downtime or database/host high availability.

## Requirement map

| Assignment requirement | Status |
| --- | --- |
| Java microservices, replicas and balancing | Implemented and live tested: identity, travel, payments, internal HTTPS and two replicas each. |
| Containerized PostgreSQL and Neo4j | Running with persistent volumes, private networks and verified TLS. Both remain single instances. |
| Jenkins and SonarQube | Local candidate CI and quality gate executed successfully. GitHub PR events now start a real disposable Jenkins/Sonar pipeline; current status is linked on GitHub PR #1. The separate main-to-staging deployment job still needs an approved target. |
| Docker and Ansible | Images built; workstation deployment executed. Independent Ubuntu deployment is not claimed. |
| Request tracing | Correlation and centralized ingestion passed; the simple collector is not a durable audit ledger. |
| Admin CRUD | People, role/status/password updates, travels/ordered destinations/participants, and gateway metadata are implemented and tested. |
| Complete travel details | Multiple destinations, dates, inclusive duration, activities, accommodation and transport persist correctly. |
| Cascades and consistency | Real PostgreSQL rollback, stale edit rejection, child/member cascades, null historical transaction references, ordered graph relationships, duplicate outbox replay and graph deletion convergence passed. |
| Authentication/authorization | BCrypt, server sessions, secure cookies, CSRF/origin checks, RBAC and revocation passed. Stored eight-hour/fifteen-minute boundaries and fixture-expiry enforcement were tested; those durations were not waited out in wall-clock time. |
| Stripe and PayPal | Sandbox gateway administration, HTTP contract tests and protected live credential checks are implemented. Owner Stripe test balance and PayPal sandbox token checks passed through the Admin API with secrets held in Vault. No charge, capture or refund was performed. |
| Responsive Chrome and Firefox | Current live browser checks passed. Earlier broader portable consistency/orbit evidence is historical; current portable design was rerun. Firefox WebGL and physical phones are not certified. |
| Feature unit tests | 78 Java, 63 frontend and 29 provisioning tests passed. See TEST-MATRIX.md; coverage is not proof of all possible behavior. |
| PR workflow, review and approved merges | Superseded by [SOLO-MAINTAINER-DELIVERY.md](SOLO-MAINTAINER-DELIVERY.md): [PR #1](https://github.com/hujaafar/travel-plan/pull/1) and [PR #2](https://github.com/hujaafar/travel-plan/pull/2) are both merged into `main` on GitHub and synced to the course Gitea repository. GitHub still enforces `travel-plan/jenkins`, `travel-plan/live-tests` and administrator compliance; required approvals are now a standing 0 for both hosts because no second collaborator exists. No independent human approval has occurred or is claimed. |
| TLS, private networking and Vault | Live transport checks passed; scoped AppRoles and separate SQL runtime roles are in use. The development CA is not a public-domain certificate. |
| Least privilege | Application RBAC, SQL roles, and Vault scopes are verified. Neo4j Community still has implied administrative privileges at the database layer (requires a licensed Enterprise/Aura role to fix); as a verified compensating control, `identity` and `payments` are removed from Neo4j's network entirely in both Docker Compose and Kubernetes — only `travel` can reach it, confirmed live by `scripts/verify-infrastructure.py`. |
| High availability | Kubernetes application, PostgreSQL and Vault HA inputs are implemented and render successfully. Production certification remains incomplete until they run across independent failure domains with licensed Neo4j clustering and measured recovery. |
| Maintenance/packages | Renovate, audit gates and package/asset decision records supplied. Java/container/OS vulnerability review remains ongoing work. |
| Bonuses | Schema/API/architecture/operations documentation, real integration/E2E tests, measured failover, isolated backup restores and validated Kubernetes/production-operator assets are supplied. |

## Remaining owner/environment gates

1. Require successful current GitHub checks and obtain independent human approval. GitHub now runs and publishes the required Jenkins and live-deployment checks automatically; their current status must be inspected on the PR. No reviewer is currently assigned. After review, synchronize the approved result back to the course repository without claiming the old local build as a new PR result.
2. Deploy the supplied HA assets on independent Kubernetes nodes with approved DNS, certificates and storage classes, then record failure and recovery results.
3. Provide a licensed Neo4j deployment supporting the documented scoped runtime role. No license or paid account was activated.
4. Establish off-device protected backups, rotation, recovery targets and production capacity testing. Local lists are still unbounded; pagination and catalogue-scale load testing remain before large deployments.

The earlier Docker uninstall lost the old data disk. Current checks use newly initialized project data; previous records were not recovered. The latest private backups are outside Docker under `.secrets/backups/` and are excluded from deliverables. Read DOCKER-RECHECK.md before any runtime repair.

## Git-host review setup verified on 17 September

`main` was created at the existing foundation commit `19c9fdd22b9a68ceef1fe3930da4ccdf1be561a1` and made the default branch. The completed implementation stays on `feature/admin-platform` until review. PR #1 initially contained the subsequent nineteen commits; this audit update is also submitted through that PR. The foundation itself had no independent review, so the reviewer must inspect its files as well as the PR diff. No history was rewritten, and creating the base branch does not retroactively establish reviewed development history.

The saved protection rule also dismisses stale approvals, blocks rejected and outstanding requested reviews, blocks outdated PRs, and has no bypass allowlist. The PR page showed the required Jenkins check missing and **0 of 1** approvals. The collaborator list was empty. No reviewer access, API token or webhook endpoint was invented. See DELIVERY.md for the remaining CI integration contract.

## Subsequent GitHub migration

The owner requested development on GitHub, then delivery back to Gitea, and explicitly approved public source. GitHub is now the development remote; its protected PR runs the checks described in GITHUB-WORKFLOW.md on fresh hosted Linux runners. No laptop, course Git, provider or deployment credentials were uploaded. Each run archives its own sanitized evidence and source SHA.

Fresh cloud startup exposed a real resource defect: Docker killed the Vault server at 192 MB and agents at 256 MB (exit 137, OOMKilled true). The default server and agent limits are now 512 MB, with Go memory/concurrency targets set explicitly. One following live run passed before another fresh runner exposed the remaining agent limit, so a single warm start is not treated as sufficient evidence. Final check results must be taken from the current GitHub PR; failed earlier runs remain visible. This change does not claim database/host high availability.

A later Firefox reload returned a connection-refused error while Caddy remained running without restart or OOM. Its responses advertised HTTP/3 even though Compose publishes only TCP. The ingress now explicitly serves HTTP/1.1 and HTTP/2, with a live check preventing an unreachable HTTP/3 advertisement. CSRF and service-key headers are also excluded from access logs. The browser suite remains unchanged; no retry or skipped scenario was added.

The subsequent completion pass makes the GitHub live job execute the Ubuntu Ansible deployment playbook against its disposable host, using the host's preinstalled Docker/JDK. It also adds frontend V8 coverage and Sonar LCOV import, including untested source files. These are separate from the older workstation/syntax-only and Java-only coverage observations above. Use the current PR's successful workflow and archived Ansible/coverage reports for the exact revision. Bare-server apt installation, owner sandbox accounts, independent approval and independent-host HA remain distinct external requirements.
