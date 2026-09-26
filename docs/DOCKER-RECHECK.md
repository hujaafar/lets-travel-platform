# Docker recovery and current operation

17 September 2026. Docker Desktop 4.90.0 / Engine 29.7.2 is running. Travel Plan has two replicas of each Java service. The user explicitly allocated the shared runtime to Travel Plan and allowed Neo4flix to remain temporarily paused. CI and monitoring are staged according to the final handoff; data volumes are retained.

## Recovery history

The 14 September reinstall, performed in the coordinated task, removed the old Docker database disk despite keep-data. Source and host-side credentials survived; old Travel Plan records were not recovered. The user authorized fresh initial project data. This remains a historical data-loss incident.

The 17 September fresh application startup and live tests passed. During CI, Docker/WSL became unresponsive. WSL memory remains capped at 4 GB; a 2 GB disk-backed swap buffer was enabled. The previous `.wslconfig` is preserved in the private task work area. No registry/security settings, application volumes or Docker data disk were changed during this recovery.

Docker then reported Windows error 1920 on `sailor-ingest.sock` and `docker-secrets-engine/engine.sock`. Only Docker-owned processes were stopped. The exact volatile runtime directories were preserved by verified directory renames, and Docker recreated them. The engine recovered. No factory reset, reinstall, pruning or volume deletion was used in this recovery. Similar failures are reported in [Docker issue 675](https://github.com/docker/desktop-feedback/issues/675). WSL swap behavior is documented by [Microsoft](https://learn.microsoft.com/en-us/windows/wsl/wsl-config).

Package downloads behind the computer's TLS inspection initially failed certificate checks. Temporary build trust stores and the dedicated CI node use already trusted public roots; TLS verification remains enabled. Jenkins now includes its timestamp and JUnit plugins and runs builds on a separate unprivileged agent.

## Current proof and operating limits

All final images built, bootstrap completed, and the replicated stack became healthy. The current Chrome/Firefox, database/TLS, logging, failover, workstation Ansible and local Jenkins/Sonar results are in FINAL-AUDIT.md. Private PostgreSQL and Vault snapshots were saved outside Docker and restored in isolated fixtures; these are backups of the fresh records, not the lost pre-uninstall database.

Run `python scripts/start.py --replicas 2` to rebuild/provision/start the verified replicated profile. Use `--no-build` only when the installed images match the intended source. The default laptop launcher uses one replica. Keep existing `.secrets` with its volumes; bootstrap unseals Vault and renews AppRole credentials.

Stop the application/monitoring before running Jenkins and Sonar on this laptop. Keep data volumes and use `compose.tools.local.yml` for bounded local Sonar heaps. Restore Travel Plan afterward. Never run all profiles simultaneously or use `down -v` for routine recovery. A normal stopped-container state is not a reason to reinstall Docker.
