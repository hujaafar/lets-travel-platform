# CI, review and deployment

> Delivery update: the owner authorized a documented solo-maintainer branch-protection policy on 17 September 2026, applied to both PR #1 and PR #2. See [SOLO-MAINTAINER-DELIVERY.md](SOLO-MAINTAINER-DELIVERY.md) for the current standing rules; earlier approval/merge statements below are superseded by the linked PRs.

## Active development workflow

The owner moved development to [GitHub](https://github.com/hujaafar/travel-plan), with Gitea retained as the final course delivery destination. See [GITHUB-WORKFLOW.md](GITHUB-WORKFLOW.md) for the executed-on-PR Jenkins/Sonar and live deployment jobs, enforced GitHub checks and synchronization policy. The course setup below is retained as the earlier delivery configuration; it must not be mistaken for the active GitHub CI integration.

## Branch workflow

[PR #1](https://github.com/hujaafar/travel-plan/pull/1) (the admin platform) and [PR #2](https://github.com/hujaafar/travel-plan/pull/2) (Admin-only access fix and load/redeployment gates) are both merged into `main` on GitHub, and synced to the same commit on the [course Gitea repository](https://learn.reboot01.com/git/hujaafar/travel-plan) via [PR #2 there](https://learn.reboot01.com/git/hujaafar/travel-plan/pulls/2). The default branch previously held the original foundation commit `19c9fdd22b9a68ceef1fe3930da4ccdf1be561a1`; that foundation had no independent review either, so a reviewer inspecting this project should read both the original files and the two PR diffs.

There are no collaborators assigned, and GitHub will not let a PR author approve their own pull request. Because of that, the saved Git-host rule on both `main` branches now sets **required approvals to 0** as a standing solo-maintainer policy (not a one-off exception per PR) while keeping direct/force pushes to `main` disabled, required conversation resolution, and administrator enforcement on GitHub. GitHub still requires the exact status contexts `travel-plan/jenkins` and `travel-plan/live-tests` to pass before merge. Gitea has no runner that publishes those same contexts, so its required-status-check rule was disabled there rather than left permanently unsatisfiable; Gitea's actual quality gate for a given commit is whichever GitHub Actions run against that same SHA, linked from the PR description.

SCM-triggered checks and status publishing still need integration. Configure the [Jenkins Gitea integration](https://plugins.jenkins.io/gitea/) with a repository-scoped service credential supplied by the owner. The [Gitea Checks plugin](https://plugins.jenkins.io/gitea-checks/) publishes named statuses through the API and requires valid Gitea API credentials. Configure its check name to match `travel-plan/jenkins` exactly and verify that the reported SHA is the PR head. Publish pending before the run and success only after the full required checks pass; failures and aborted runs must never publish success. Do not copy build 6's result to a later PR revision.

Use authenticated webhook delivery only when a reachable Jenkins endpoint is provided, or configure authenticated SCM polling while the controller is running. The current loopback-only laptop service is not an Internet webhook endpoint. A browser login does not supply a Jenkins service credential. Keep that credential in Jenkins' credential store, out of PR workspaces and source archives. Fork PRs must run without deployment or production credentials; use a trusted Jenkinsfile policy and restricted Sonar tokens. Verify an actual new PR commit triggers a build and updates the required status before calling the integration complete. Do not relax the protected branch while it is pending.

## Jenkins and SonarQube

```powershell
python scripts/bootstrap.py
docker compose -f compose.yml -f compose.tools.yml --profile tools up -d --build jenkins sonar-db sonarqube sonar-tls
```

Jenkins: `https://localhost:18443`, admin password `JENKINS_ADMIN_PASSWORD` in `.secrets/bootstrap.json`. The controller has **zero build executors** and authenticated access. The agent image supplies Java 21, Maven, Node 22, Python, Ansible, Docker CLI/Compose and browser system dependencies. The full pipeline requires a dedicated agent with label `travel-plan-build` and a disposable TLS-authenticated Docker daemon. A separate `travel-plan-review` container is configured locally for the candidate review pipeline without any Docker socket or application secrets.

SonarQube: `https://localhost:19443`. Complete the vendor's initial account setup and change its initial password before exposing it. Create project `travel-plan`; add a project-scoped analysis token to Jenkins as a SonarQube server named `travel-plan-sonar`. Configure the SonarQube webhook to the Jenkins `/sonarqube-webhook/` endpoint and validate TLS trust. The services can reach each other through the Docker egress network using their service names, while host ports remain loopback-bound.

The supplied SonarQube Community Build supports main-branch analysis. In the Jenkins multibranch job, **both Sonar analysis and its quality-gate wait run only on `main`**. PR and other feature-branch jobs skip both stages, so they neither request unsupported PR analysis nor publish their code into the main Sonar project. They still run Java units, dashboard build/unit/format checks, dependency auditing, and container builds. Require these Jenkins checks and an independent human review before merging. The Community main-branch gate runs after the merge and blocks staging deployment; it does not provide a pre-merge Sonar PR gate. Meeting a review requirement for Sonar analysis on every PR needs a supported PR-analysis offering and its Git-host integration, configured separately. No license, cloud project, or independent approval has been supplied. See the current [SonarQube feature comparison](https://docs.sonarsource.com/sonarqube-community-build/feature-comparison-table).

Follow SonarQube's current host prerequisites and memory recommendations. The optional `compose.tools.local.yml` bounds the web/compute heaps for staged local checks; it does not disable Elasticsearch bootstrap checks or establish production sizing. Run CI separately from the application on this laptop. See [operations](OPERATIONS.md) for the local review procedure and [Sonar host requirements](https://docs.sonarsource.com/sonarqube-community-build/server-installation/server-host-requirements).

Container builds use `compose.build.yml`, a separate model with the same image tags, Dockerfiles and build arguments as the runtime deployment, without runtime secrets, mounts or ports. A fresh PR checkout can build it without bootstrapping Vault or receiving production credentials:

```bash
docker compose -f compose.build.yml config --quiet
docker compose -f compose.build.yml build
```

Trusted non-PR builds initialize disposable development credentials and run integration/browser tests on a disposable agent. Deployment runs only for main with `DEPLOY_STAGING=true`, a successful main-branch Sonar gate, and an explicit Jenkins input approval. Configure `travel-plan-deploy` SSH credentials and `STAGING_INVENTORY` before enabling it. A clean PR pipeline and an independent review approval must precede merging; this file alone cannot enforce Git-host policy. Configuration validation does not demonstrate a completed Jenkins pipeline, Sonar gate, or deployment.

Official references: [Jenkins quality-gate integration](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/ci-integration/jenkins-integration/pipeline-pause), [Docker Compose Ansible module](https://docs.ansible.com/projects/ansible/latest/collections/community/docker/docker_compose_v2_module.html).

## Ansible

Use a Linux Ansible controller. The supplied package recipe supports **Ubuntu 22.04 LTS (jammy) and 24.04 LTS (noble)** with the universe repository enabled, where `docker-compose-v2` is available. An explicit preflight rejects Debian and other releases before changing packages; they need a distribution-specific provisioning recipe. This declared support has not yet been demonstrated by an executed Ansible deployment. The playbook creates a private directory, installs prerequisites, imports a reviewed source archive, provisions local development secrets, and starts the system with the requested replica count.

```bash
ansible-galaxy collection install -r infra/ansible/requirements.yml
git archive --format=tar.gz --output=travel-plan-source.tar.gz HEAD
ansible-playbook -i infra/ansible/inventory.ini infra/ansible/deploy.yml \
  -e artifact_path="$PWD/travel-plan-source.tar.gz" -e replica_count=2
```

Copy `inventory.example.ini`, substitute the actual SSH host, and keep real inventory credentials outside Git. The example IP is documentation-only. The playbook does not publish a public domain or install production database replication. Its default ports remain localhost-only on the deployment host; use authenticated SSH forwarding for review.

The separate `infra/ansible/workstation.yml` has been executed against this Windows Docker Desktop installation from WSL. It provisions the existing checkout through Windows Python and verifies the running databases and TLS. The GitHub live job now executes `deploy.yml` on a disposable Ubuntu 24.04 host using its already installed Docker/JDK (`manage_system_packages=false`); consult the current job result and archived Ansible log for execution evidence. The default package-installation branch remains enabled for bare Ubuntu servers and needs its own target verification. An existing Docker installation is checked explicitly before it is used.

## Maintenance

Renovate configuration proposes dependency updates without auto-merging. Review images and language dependencies regularly, run all checks, and patch promptly. Pin approved image digests for a release. Never include `.env`, `.secrets`, node_modules, target, or build reports in a source artifact.

## Reproducible review gates

The pipeline now validates the four Compose models and requires actual Ansible syntax checks in its configuration stage. Its trusted integration stage also runs the TLS/database verifier and authenticated service-log correlation; `--service-logs-only` explicitly does not prove Loki ingestion. Configuration and integration reports are archived by Jenkins. See [INFRASTRUCTURE-GATES.md](INFRASTRUCTURE-GATES.md) for the separate centralized-ingestion and opted-in replica-failure commands. No actual Jenkins or remote deployment success is claimed from these source edits.

## Executed local candidate review

Jenkins job `travel-plan-local-review` build **6** passed against committed application source `5380cfe659520ccf6cb49b096a534b8ab2d25fe1`. It ran Java, frontend, native Linux provisioning and configuration/Ansible checks, then submitted Java and dashboard sources to the private Sonar project. The candidate gate copies Sonar way and adds whole-project conditions: zero bugs, zero vulnerabilities and at most 3% duplicated lines. It passed without ignored conditions. The final runtime Caddy SNI correction was validated separately with real Java HTTPS, the infrastructure probe and both browsers. See FINAL-AUDIT.md for exact provenance.

This local job consumes a verified Git archive. It has no SCM blame, Git-host PR webhook, independent reviewer, deployment credentials or application Docker socket. The configured main pipeline remains a separate deliverable requiring those integrations. Sonar reported 94 existing maintainability findings and 49.8% combined coverage; Java JaCoCo coverage is separately measured, and frontend LCOV is not imported. A passing gate is not a claim of zero maintainability debt or complete security assurance.
