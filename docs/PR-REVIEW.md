# Travel Plan admin platform and deployment review

> Delivery update: the owner authorized a documented solo-maintainer merge exception on 17 September 2026. See [SOLO-MAINTAINER-DELIVERY.md](SOLO-MAINTAINER-DELIVERY.md). Approval and merge statements below are the earlier audit snapshot; use the linked PRs for actual current status.

Active review: [GitHub PR #1](https://github.com/hujaafar/travel-plan/pull/1). The owner requested GitHub development followed by synchronization to the course repository. GitHub now runs the required Jenkins/Sonar and live-deployment checks automatically; inspect their current result on that PR. One independent approval remains required, and no merge is claimed. See GITHUB-WORKFLOW.md. The Gitea review below records the earlier course-side setup.

[PR #1: Complete Atlas admin experience and harden Travel Plan deployment](https://learn.reboot01.com/git/hujaafar/travel-plan/pulls/1) is open. It has not been independently approved or merged. `main` is the original foundation; the completed implementation is on `feature/admin-platform`. Review the foundation as well as the subsequent diff.

Adds Java identity, travel and payment administration services with PostgreSQL persistence, an idempotent Neo4j outbox, server sessions, RBAC and CSRF protection. The responsive Atlas dashboard shares its TP logo, controls, forms and native-scroll scenes across every page.

The deployment uses internal TLS, scoped Vault configuration, separate SQL runtime roles and two Java replicas behind Caddy. Read-only session checks now balance across identity replicas, and temporary authentication outages preserve browser state while rejecting protected operations. Jenkins uses a dedicated unprivileged build agent; Ansible supports a separate verified workstation deployment.

Validation: Jenkins candidate build 6 passed 78 Java, 63 frontend and 29 Linux provisioning tests, production build/format/audit checks and configuration/Ansible checks. The strengthened Sonar gate passed with zero detected bugs or vulnerabilities. Current live Chrome (seven scenarios), Firefox workspace (five), database/TLS, centralized tracing, replica failover, Ansible deployment and isolated PostgreSQL/Vault restore checks passed. See FINAL-AUDIT.md for measured failures/recovery and exact source provenance.

The saved protection rule disables direct/force pushes, requires one approval and the exact `travel-plan/jenkins` status, dismisses stale approvals, blocks rejected/outstanding reviews and outdated PRs, and applies to administrators without bypass. Gitea visibly reports the required check missing and zero of one approvals. No collaborator is assigned.

GitHub PR events now execute and publish the two required checks; use the current PR head's result. Course-side status forwarding is separate and must identify the exact tested SHA and source run. Remaining gates are independent approval; owner Stripe/PayPal sandbox connection tests; scoped Neo4j runtime privileges; independent-host infrastructure HA and production capacity/backup operation. This single-host deployment does not satisfy those external gates. No merge or public application deployment is claimed.
