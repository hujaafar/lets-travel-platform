# Operations scripts
Run `python -m pip install -r scripts/requirements.txt`, then `python scripts/bootstrap.py`.
`python scripts/start.py` or `start.ps1` builds images sequentially, runs bootstrap,
and waits for the single-replica laptop profile. Use `--replicas 2` for the base
deployment, or `--no-build` after building the current revision. Startup stops
on a failed stage instead of announcing an unavailable URL. An optional
`BUILD_CA_FILE` selects the build-time organization CA overlay.
All generated credentials, PKI and Vault recovery material stay in ignored `.secrets/`.

`python scripts/prepare-ci-review.py` exports only a clean committed Git revision
to `work/ci-review`, with a SHA-256 checksum and revision file. Mount that directory
read-only at `/review` in the dedicated agent for `infra/jenkins/Jenkinsfile.review`.
The archive contains no ignored working files or local credentials.

On POSIX hosts bootstrap sets umask `077` before writing, keeps `.secrets/` at `0700`, and restricts operator provisioning files, the Vault root token, CA private key and root `.env` to `0600`. It repairs existing operator-file modes on rerun. The specifically mounted per-service TLS/AppRole files, PostgreSQL init SQL and Grafana provisioning remain readable inside their non-root containers; the private host parent prevents other host users from reaching those exports. Do not mount the entire `.secrets/` directory into an application container.

Windows retains the existing user-profile ACL. The script does not alter home-directory ACLs; keep the checkout and `.secrets/` within the owner's protected account directories. Actual Docker startup is a separate validation from these filesystem checks.

Run `python -m unittest discover -s scripts/tests -v` to check the isolated permission helper without invoking bootstrap or Docker. POSIX mode checks require a native Linux filesystem; on Windows they are explicitly skipped. On this laptop they can run under WSL with temporary fixtures in `/tmp`.

The live `dashboard/e2e/persistence.spec.ts` suite uses `test-database-query.py`
to query this checkout's PostgreSQL and Neo4j containers. Run it only against
the local test deployment; remote URLs are skipped. Queries travel over stdin,
and the helper never prints database credentials. Tests create uniquely named
fixtures and remove them in cleanup. They verify stored session/throttle
deadlines and move only the fixture's deadline into the past; they do not wait
eight hours or change the host clock. The second case verifies real SQL
rollback, payment-history references, and graph content after edits, replay
and deletion. From `dashboard`, run:

```sh
node node_modules/@playwright/test/cli.js test --project=chrome --grep database
```
