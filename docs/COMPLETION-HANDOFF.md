# Completion handoff — 20 September 2026

The application has three Java microservices, an Admin dashboard, PostgreSQL/Neo4j, Caddy, Vault, Ansible, Kubernetes readiness assets and PR-triggered Jenkins/Sonar plus real browser/API deployment checks. GitHub PR #5 and course Gitea PR #4 are merged with identical source trees; the required Jenkins/Sonar and live-deployment jobs passed.

## Added in this follow-up

- Fourteen React component cases exercise non-admin login/session rejection, person creation and role/status updates, confirmed deletion for all three entity types, payment create/edit/provider errors, travel creation/details/search/stale-edit handling and session-expiry cleanup. All 77 frontend tests pass locally. Core `App.tsx` line coverage is 74.4%; overall frontend line coverage is 42.93%. The scroll/WebGL scene is intentionally mocked in component tests and covered separately by real-browser checks. These numbers are not a claim of exhaustive coverage.
- `infra/ansible/service.yml` deploys or scales only identity, travel or payments. It uses the existing source/configuration and does not rerun database/bootstrap tasks. The new CI gate scales Travel from two to three replicas, checks authenticated reads, restores two, and verifies that other container IDs and start times did not change.
- `scripts/verify-providers.py` tests both configured sandbox providers through the protected Admin API. Missing records/credentials or provider errors fail the gate. Reports contain provider names/status, not credentials or provider response bodies. It does not charge money.
- Seven additional Python cases guard against missing provider evidence, unrelated container replacement/restart, and accidental workstation redeployment. The local Python suite ran 51 tests: 49 passed, two existing JDK-dependent cases skipped. CI runs the JDK-dependent cases with the installed toolchain.
- Bootstrap now preserves an operator-configured Neo4j runtime password instead of replacing it with the local Community administrator password on every rerun. Existing URI/username settings are retained. This supports a future scoped deployment; it does not grant Community edition fine-grained privileges.
- React Testing Library, its DOM peer and jsdom are development-only dependencies for component interaction tests; production bundles do not include them. The local npm audit reported zero vulnerabilities.

Use the follow-up PR's checks for the actual final source revision. Previous green runs do not certify these new changes.

## Start and demonstrate the assignment

Run the existing bootstrap/start instructions in README. Use the base two-replica profile when demonstrating scalability and failover; the laptop override intentionally runs one Java replica each.

After starting the stack:

```bash
python scripts/verify-infrastructure.py
python scripts/verify-logging.py --service-logs-only
python scripts/verify-failover.py --run-failover
python scripts/verify-load.py --run-load
```

The load/failover commands temporarily stop one Java replica at a time and restore it. Run them on a disposable review stack, not a production environment. For centralized logging evidence, start the documented monitoring profile and omit `--service-logs-only`.

The GitHub live job now executes full Ansible deployment, repeat deployment with data/session checks, independent Travel scaling, verified transport/logging, Chrome/Firefox, recovery and bounded concurrent load. The Jenkins job runs the unit suites, build, formatting, configuration and Sonar checks.

## Deploy or scale one service

Stage the reviewed source on an already bootstrapped host, then run:

```bash
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/service.yml \
  -e service_name=travel -e replica_count=3
```

Create `inventory.ini` privately from `inventory.example.ini` and set `app_dir` if different from `/opt/travel-plan`. `build_image=true` is the default; use `-e build_image=false` to scale an existing image without rebuilding. This playbook targets the selected service only, using [Ansible Compose dependency and scale controls](https://docs.ansible.com/projects/ansible/latest/collections/community/docker/docker_compose_v2_module.html). It does not provide a zero-downtime rolling image update or remove the shared-database/Identity dependencies.

## Owner sandbox check

The owner Stripe test key and PayPal sandbox credentials are stored privately in local Vault. Both provider checks passed through the protected Admin API on 20 September 2026. No payment was collected. Re-run the credential-free verifier after rotating keys:

```bash
python scripts/verify-providers.py
```

The command verifies Stripe test balance access and PayPal sandbox token issuance. Its report is `work/verification/providers.json`; a missing key produces failure, not a misleading green “skipped” result. The general CI suite deliberately does not receive provider secrets.

## External prerequisites that remain

| Requirement | What is needed to close it |
| --- | --- |
| Neo4j least privilege | A Neo4j offering supporting scoped database privileges, with a restricted runtime user, verified TLS and negative permission tests. The shipped Community deployment still has implied administrative privileges. |
| Whole-system HA | Provisioned independent failure domains, redundant ingress, database failover and Vault availability/unseal design, then failure/recovery measurements. Multiple Java replicas on one host do not establish this. |
| Strict service/data independence | A separate architectural migration from cross-schema foreign keys to independently owned data and durable lifecycle/deletion workflows. The current atomic cascade contract remains explicit. |
| Independent approval | A second person must review the PR. Passing CI and a solo-maintainer merge policy are not an independent human approval. |

Kubernetes application and production-operator templates are implemented under `infra/kubernetes`, with a certification runbook in `docs/PRODUCTION-HA.md`. The project must not be described as satisfying every production claim until those assets run on independent infrastructure and the remaining external rows above are verified. This document provides executable delivery steps, not an invented production certification.
