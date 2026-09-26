# Verification record — 17 September 2026

> Current rubric review: see [REQUIREMENTS-AUDIT.md](REQUIREMENTS-AUDIT.md) and [PR #2](https://github.com/hujaafar/travel-plan/pull/2). Measurements below are the September 17 historical snapshot.
The authoritative current requirement/result matrix is [FINAL-AUDIT.md](FINAL-AUDIT.md). This replaces the earlier source-only and paused-runtime summaries.

The application source verified by Jenkins build 6 is `5380cfe659520ccf6cb49b096a534b8ab2d25fe1`; final live checks also include Caddy revision `65b44133285224388669be1db0c8e5994cd823ae`. Documentation-only changes follow. Reports preserve individual timestamps, source revisions, failed attempts and successful reruns.

- 78 Java, 63 dashboard and all 29 Linux provisioning tests passed.
- 38 configuration contracts and Ansible syntax passed; the workstation deployment actually ran.
- The strengthened candidate Sonar gate passed: zero bugs/vulnerabilities/hotspots, 94 maintainability findings, 49.8% combined coverage. Java JaCoCo is 439/456 lines and 158/176 branches.
- Seven Chrome live cases, five Firefox workspace cases, TLS/database validation, centralized log correlation, Java replica recovery and isolated PostgreSQL/Vault restoration passed.
- The current standalone preview passed the design suite. Earlier full consistency/orbit contact sheets remain historical visual evidence. The preview uses fictional browser-local data and does not authenticate against Java services.

The evidence ZIP includes raw sanitized runs, Java XML/coverage, CI records, Sonar metrics and live verifier reports. A pipeline/gate pass does not certify production HA, provider credentials, whole-stack security or an independent approved PR. Those gates remain explicit in the audit.
