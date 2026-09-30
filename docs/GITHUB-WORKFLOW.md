# GitHub workflow

The active portfolio repository is [hujaafar/lets-travel-platform](https://github.com/hujaafar/lets-travel-platform). Earlier repository and PR metadata was saved before consolidation; see [migration notes](PORTFOLIO.md) and [historical PRs](HISTORY.md).

## Required checks

`.github/workflows/verify.yml` runs on pull requests targeting `main`, pushes to `main` and manual dispatch. Public GitHub-hosted Linux runners execute these two checks:

| Check | Actual execution |
| --- | --- |
| `lets-travel/jenkins` | Disposable TLS Jenkins controller and unprivileged agent; Java tests/coverage, frontend build/format/unit/audit, Python tests, deployment configuration checks and a real SonarQube quality gate. |
| `lets-travel/live-tests` | Ansible deploys the actual stack with two Java replicas. The job verifies roles/discovery/demo data, TLS, logs, reapplication, service deployment/scaling, Chrome/Firefox, failover and concurrent load. |

Checkout targets the PR head or push SHA. Actions are pinned to commit hashes, checkout does not persist credentials and the workflow token has read-only source permissions. There is no `pull_request_target` or self-hosted runner. Fresh random development credentials stay inside disposable CI; provider and course credentials are never supplied to PR code. The Jenkins agent does not receive the Docker socket.

Evidence is uploaded as `jenkins-sonar-evidence` and `live-test-evidence`, with fourteen-day artifact retention. Current run status and recorded source SHA establish which revision passed; copied old results do not establish a new run.

## Sonar interpretation

SonarQube Community scans a fresh candidate project, rather than performing native persistent pull-request analysis. The gate copies the installed Sonar way conditions and adds zero whole-project bugs, zero vulnerabilities and at most 3% duplication. A new candidate has no historical new-code baseline; read its archived gate result for evaluated and unavailable conditions.

Java coverage and Vitest V8 LCOV are imported. All dashboard TypeScript/TSX source is included in the coverage denominator except tests and declarations. Browser E2E success is separate from unit coverage. A passing gate is not a production security certification.

## Main-branch policy

Both checks are required, the branch must be up to date, conversations must be resolved, and enforcement applies to administrators. Force pushes and branch deletion are disabled. The required approval count is zero because this is a solo-maintainer portfolio; automated verification is not described as independent human review.

Course Gitea repositories are separate submission destinations. This consolidation does not remove, rewrite or automatically synchronize them. Keep course credentials local. Application development should proceed through pull requests in this portfolio repository.
