# Solo-maintainer delivery policy

On 17 September 2026 the owner authorized a documented solo-owner merge exception for PR #1, after being told that it does not fulfill the assignment's independent-review requirement. No teammate was available. On 19 September 2026, the same reasoning was applied a second time for PR #2, and the underlying branch-protection rule was changed from a per-merge exception into a **standing policy**: required approvals are set to 0 on both hosts' `main` branch rather than temporarily dropped and restored each time. This is owner authorization to merge verified work, not a peer approval. No second identity or approving bot was created, and none should be.

## Standing branch-protection state

- **GitHub `main`:** required approving reviews = 0; `travel-plan/jenkins` and `travel-plan/live-tests` remain required status checks; direct/force pushes disabled; administrator enforcement stays on, so nobody — including the owner — can push straight to `main` or merge without those two checks passing on the exact PR head.
- **Gitea `main`:** required approvals = 0; the required-status-check rule was disabled entirely, because no runner on that host ever publishes the `travel-plan/jenkins`/`travel-plan/live-tests` contexts (only GitHub Actions does). Leaving it enabled would have made every future Gitea PR permanently unmergeable, not safer. Gitea's `main` is intended to always be a direct sync of a GitHub `main` commit that already passed both real checks there — the Gitea PR merge is a delivery step, not an independent quality gate.

This is a explicit, disclosed reduction in review rigor made necessary by working alone, not a claim that peer review happened. Anyone auditing this repository should treat "merged" as "passed automated CI, self-merged by the owner," never as "independently approved."

## Merge procedure (applied to PR #1 and PR #2)

1. Keep `travel-plan/jenkins` and `travel-plan/live-tests` required and successful for the exact PR head on GitHub before merging there.
2. Record the owner authorization, reviewed revision and evidence in the PR description; do not bypass or fabricate CI results.
3. Merge the PR on GitHub (plain merge commit, not squash/rebase, to preserve individual commit history).
4. Fetch the resulting `main` and push it to the corresponding feature branch on the course Gitea repository, open a Gitea PR from that branch into Gitea's `main`, and merge it there once its (status-check-free) merge button is available. Record the resulting SHA on both hosts and confirm they match (`git diff <github-sha> <gitea-sha>` should be empty).

## Verified baseline and boundaries

Application revision `27b89d223fc7c2ca5c65c42a337bddbf2f59dc90` passed [run 35185811401](https://github.com/hujaafar/travel-plan/actions/runs/35185811401): 78 Java, 63 dashboard and 35 provisioning tests; 14 Chromium/Firefox scenarios; Jenkins/Sonar candidate analysis; actual Ubuntu Ansible deployment; internal TLS; centralized logging; Java replica recovery.

[PR #2](https://github.com/hujaafar/travel-plan/pull/2), merged 19 September 2026 (GitHub commit `d8b780f889125b1701c53e089756a6095fb34566`, synced to Gitea as `a04f1a5b12e25003109ae29a7d6f6311c7d1f600` with an identical tree), fixed a real Admin-only access defect — Viewers could previously read all business data and Travel Managers could write travel records — and added bounded concurrent-load, per-replica distribution and Ansible-redeployment-preserves-data regression gates. Both `travel-plan/jenkins` and `travel-plan/live-tests` passed on that exact commit on GitHub; see [run 35429920193](https://github.com/hujaafar/travel-plan/actions/runs/35429920193).

This document records authorization and the procedure. The [GitHub PRs](https://github.com/hujaafar/travel-plan/pulls?q=is%3Apr), [workflow runs](https://github.com/hujaafar/travel-plan/actions), and [course PRs](https://learn.reboot01.com/git/hujaafar/travel-plan/pulls) are the authoritative records of which steps actually completed. Earlier audit/review documents are dated snapshots taken before later merges and retain their original evidence for the revision they describe.

## Boundaries

A bounded AI-assisted inspection also covered authentication, authorization, CSRF, transactional CRUD, database cascades, the Neo4j outbox, provider endpoints, ingress and CI permissions. It did not establish an additional release-blocking defect in that scope, and it is not independent human approval or a security certification.

The assignment's approved collaborative review requirement remains an explicit exception. Owner Stripe/PayPal sandbox verification, supported Neo4j least privilege, and database/Vault/ingress high availability across independent failure domains remain separate gaps. Frontend unit line coverage was 15.6% and combined Sonar coverage 42.0% as of the PR #1 baseline; passing tests do not prove complete feature/path coverage. Payment capture, refunds and webhooks are outside the phase-one gateway administration scope.

No public production deployment, paid subscription, new provider account, payment transaction, or infrastructure HA is claimed by this merge procedure.

## Verified baseline and boundaries

Application revision `27b89d223fc7c2ca5c65c42a337bddbf2f59dc90` passed [run 35185811401](https://github.com/hujaafar/travel-plan/actions/runs/35185811401): 78 Java, 63 dashboard and 35 provisioning tests; 14 Chromium/Firefox scenarios; Jenkins/Sonar candidate analysis; actual Ubuntu Ansible deployment; internal TLS; centralized logging; Java replica recovery. Later commits need their own successful required checks.

A bounded AI-assisted inspection also covered authentication, authorization, CSRF, transactional CRUD, database cascades, the Neo4j outbox, provider endpoints, ingress and CI permissions. It did not establish an additional release-blocking defect in that scope, and it is not independent human approval or a security certification.

The assignment's approved collaborative review requirement remains an explicit exception. Owner Stripe/PayPal sandbox verification, supported Neo4j least privilege, and database/Vault/ingress high availability across independent failure domains remain separate gaps. Frontend unit line coverage was 15.6% and combined Sonar coverage 42.0%; passing tests do not prove complete feature/path coverage. Payment capture, refunds and webhooks are outside the phase-one gateway administration scope.

No public production deployment, paid subscription, new provider account, payment transaction, or infrastructure HA is claimed by this merge procedure.
