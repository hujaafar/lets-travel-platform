# Portfolio consolidation

This is the standalone portfolio home for the complete **Let’s Travel** platform. The earlier GitHub repositories `hujaafar/travel-plan` and `hujaafar/lets-travel` were consolidated at the owner's request. Course Gitea repositories, local source folders and application data are outside this migration.

## Scope comparison

The starting application is Let’s Travel revision `c627fd554973d7ba573dd8158c9f9d5b07aae393`, with source tree `45e8e97c3aa08fe446a398d57db06753a47826d1`. Travel Plan's final GitHub revision is `f7d54e69709c0db4735bc2432ab45cec05958d9a`; its local course history also contains subsequent synchronization merge commits.

A tracked-file comparison found **no phase-one files missing from Let’s Travel**. Changes to shared files extend the original application with the second stage, service/session naming and associated deployment settings. The newer platform retains the separate graph network and Neo4j isolation from the phase-one security revision.

| Original scope | Consolidated implementation |
| --- | --- |
| Admin users, travels and gateway management | Original admin workspace and validated admin APIs retained |
| Authentication and authorization | Extended with traveler registration, role-aware navigation and manager ownership |
| Itineraries and database cascades | Retained with publication, pricing, capacity, bookings and feedback |
| PostgreSQL, Neo4j, Vault, TLS and logging | Retained; Elasticsearch added for discovery |
| Docker, Ansible, replicas, Jenkins and SonarQube | Retained and exercised by the current CI workflow |
| Responsive dashboard and scroll scenes | Retained and extended with a coherent traveler/manager interface |
| Unit and browser tests | Existing suites retained, with phase-two and demo-activity coverage |

Application code and infrastructure were copied without changing their behavior during this consolidation. The portfolio changes cover documentation, screenshots, workflow presentation and repository metadata.

## History and migration

`main` retains the complete Let’s Travel Git history. The [`archive/travel-plan` branch](https://github.com/hujaafar/lets-travel-platform/tree/archive/travel-plan) retains the final original Travel Plan GitHub history independently; it is an archive, not the branch to run.

Before removing the two superseded GitHub repositories, complete Git mirrors and portable bundles were saved locally and verified. Repository metadata, pull requests, review comments, settings and workflow-run metadata were also exported. Old pull request numbers and Actions run IDs belong to the retired repositories and were not recreated as new approvals or new CI results.

Inherited phase-one audits remain dated historical documents. Their original repository links are retired references. Use this repository's [current Actions runs](https://github.com/hujaafar/lets-travel-platform/actions), source revision and uploaded artifacts when evaluating the portfolio version.

## Current verification

The [Build & verification workflow](https://github.com/hujaafar/lets-travel-platform/actions/workflows/verify.yml) runs the real Jenkins/Sonar and Ansible/live-browser jobs against this repository. Repository consolidation is not accepted based solely on the old repository's checks; a successful run on the new repository is required before the old GitHub repositories are removed.

The inherited application is educational and uses a single-host local stack. Production HA, an independent human reviewer and PayPal's complete settlement/refund cycle are not claimed. The [README](../README.md) and [platform security guide](PLATFORM-SECURITY.md) document these boundaries.
