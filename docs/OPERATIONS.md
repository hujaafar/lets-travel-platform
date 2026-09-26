# Operations

## Start, stop, and inspect

```powershell
python scripts/bootstrap.py
docker compose -f compose.yml -f compose.local.yml up -d --build --wait --wait-timeout 240
docker compose ps
docker compose logs --since 5m identity travel payments
docker compose stop
```

Stopping preserves data. Do not run `down -v` unless intentionally destroying the development databases and Vault. After restarting Vault, run bootstrap to unseal it before starting the agents. The startup script does this. App processes wait for scoped configuration before launching; readiness probes are HTTPS.

For the 14 September identity update, run `python scripts/bootstrap.py` before starting new identity replicas. Its idempotent database upgrade adds/backfills `identity.bootstrap_state`, which prevents a restart from recreating a deleted bootstrap administrator. The Ansible playbook runs this upgrade automatically. Starting Compose alone does not apply it to an existing database; preserve the database volume.

## Local TLS

The generated development root is `.secrets/ca.crt`. The application does not silently install a root certificate in Windows. You may import that certificate into your own development browser/OS trust store after inspecting its identity. Alternatively, inspect the local development certificate warning when opening localhost. Do not use this development CA for public deployments.

Some antivirus products replace even localhost certificates. The setup script therefore talks to Vault through a short-lived Python container on the private Docker network, with certificate and hostname verification enabled. Browser tests accept local certificate errors only within their isolated test contexts. Internal application traffic verifies certificates normally.

Certificates include SANs, key usage, extended usage, subject/authority identifiers and expiry. Each service receives only its own private certificate and a trust store containing public roots plus the development CA. Bootstrap renews certificates approaching expiry; restart affected services after renewal so they load the new certificate. Keep the CA private key out of Git.

## Vault

Vault runs with TLS and a persistent integrated Raft store. A development one-share unseal key and root token are stored in `.secrets/vault-init.json`. This is a convenience for a local assignment deployment, not a production key-custody design. Use a managed KMS auto-unseal setup and separate operator custody in production.

Each service agent authenticates with its own AppRole, reads only `secret/data/<service>`, and renders a properties file into a read-only application volume. Runtime Java services do not receive a Vault root token. After secret rotation, restart the Java service so Spring reloads properties. Agent credentials expire after 30 days; rerun bootstrap to renew them.

Bootstrap also retains the local provisioning credentials in ignored `.secrets/bootstrap.json`. Restrict access to that directory and back it up securely with the corresponding Vault data. All of these files are excluded from the source archive.

## Stripe and PayPal

Use the authenticated Vault UI at `https://localhost:18200` or Vault CLI. In KV v2 at `secret/payments`, preserve `DB_PASSWORD` and `SERVICE_KEY`, then add:

- `STRIPE_SECRET_KEY`: a Stripe **test** key beginning with `sk_test_`.
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`: credentials from a PayPal sandbox application.

Restart the payments service after the agent has rendered the change. Open Payments and choose **Test connection**. Stripe verifies through `/v1/balance`; PayPal exchanges the client credentials at its sandbox OAuth endpoint. Outbound requests have connection and response timeouts. Raw provider error bodies and credential values are not returned to the browser. Live Stripe keys are rejected.

Read the official [Stripe development documentation](https://docs.stripe.com/development) and [PayPal authentication documentation](https://developer.paypal.com/api/rest/authentication/). Phase two should use hosted payment flows, verified webhooks, idempotency keys, authoritative amounts, and a proper payment state machine.

## Logs

All Java requests produce JSON logs containing service name, request ID, method, path, status, latency and authenticated actor ID. A sanitized `X-Request-ID` is propagated into the identity service during session verification. Passwords and session cookies are not intentionally logged.

```powershell
docker compose -f compose.yml -f compose.tools.yml --profile monitoring up -d --build loki log-collector grafana
```

Grafana is at `https://localhost:13443`; username `admin`, password `GRAFANA_ADMIN_PASSWORD` in the local provisioning file. Explore the preconfigured Loki datasource with `{project="travel-plan"}` or `{service="travel"}` and search a request ID. Collection begins when the collector starts; earlier logs remain available through Docker. The collector retries briefly but is not a durable audit ledger. The Docker socket is privileged even when its bind mount is read-only: deploy this collector only on a trusted host.

## Backups and recovery

Use PostgreSQL `pg_dump -Fc` and restore into a separate clean database to test it. On PowerShell, redirect binary output through a binary-safe Python subprocess or a file inside the container; avoid text pipelines. Back up `.secrets/` through an encrypted, access-controlled channel. Use Vault Raft snapshots after unsealing. Neo4j's graph can be rebuilt from PostgreSQL by enqueuing all current travel IDs, but take a Neo4j database dump if other graph data is introduced.

Local PostgreSQL dump restoration and a Vault snapshot restoration have passed in isolated fixtures. Host-side private backups are in `.secrets/backups/`; they are excluded from source and handoff ZIPs. This is not an off-device backup policy or multi-host disaster recovery. The deployment still uses named volumes on one Docker host.

## Graph connection on an approved deployment

The travel service accepts optional `NEO4J_URI` and `NEO4J_USERNAME` properties. Defaults remain `bolt+s://neo4j:7687` and the local `neo4j` account; the password continues to come from the existing scoped Vault configuration. Supply these settings to the service through the approved deployment configuration, preserve a verified-TLS URI and trusted certificates, and use a scoped runtime account only on a Neo4j offering that supports it. Renaming a Community account does not remove its implied admin privileges. No alternate database or license was activated in this pass.

Spring's Neo4j health indicator and the outbox projector use the same managed driver. Its connection settings come from the existing Vault properties. A healthy TCP listener alone does not prove database authentication; run `verify-infrastructure.py` after startup.

## Session verification during replica failure

Compose routes travel/payments session checks through Caddy's unpublished HTTPS listener on port 9444. That listener accepts only `/internal/session`; identity still requires the exact service key. DNS discovery and bounded retries cover this read-only operation. The public listener rejects internal paths. Application writes retain Caddy's default safe retry matching. Kubernetes may use its identity Service through the default `APP_AUTH_URL` value instead.

Caddy's `default_sni dashboard` selects the existing local certificate when a Java client omits SNI for the single-label Docker hostname. Java still checks its CA chain and dashboard hostname; TLS verification is never disabled.

An authentication dependency outage returns 503 with `Retry-After`, fails closed, and preserves the browser's session state. An expired/revoked session still returns 401. No request reaches its business controller without a verified user.

## Ansible on this Windows workstation

The Ubuntu server recipe remains `infra/ansible/deploy.yml`. For an existing Docker Desktop installation with WSL, use the separate workstation playbook. It calls Windows Python and Docker Desktop so bind mounts resolve correctly; it does not install a second Docker daemon in WSL.

Copy `infra/ansible/workstation.example.yml` outside Git, set the actual checkout and Python paths, then run from a WSL Ansible controller:

```sh
ansible-playbook -i localhost, infra/ansible/workstation.yml -e @your-workstation.yml
```

The default builds and deploys two replicas per Java service, then verifies TLS and database privileges/convergence. Set `build_images: false` only when those images already contain the intended revision. Provisioning output is private. Re-running preserves database volumes and existing application passwords, while renewing AppRole credentials; the provisioning task therefore reports a change.

## Local Jenkins and Sonar review

`infra/jenkins/agent.Dockerfile` supplies Java 21, Maven, Node 22, Python, Ansible, Docker CLI/Compose and browser system dependencies. Run jobs as the unprivileged `jenkins` user. The controller keeps zero executors; its image installs the plugins required by both pipelines. Configuration lives outside the persistent home volume so rebuilding the image applies configuration updates.

The full `Jenkinsfile` targets an isolated `travel-plan-build` agent with a dedicated TLS-authenticated build daemon and configured SCM/Sonar/deployment credentials. Never attach an untrusted PR job to the workstation's Docker socket. Browser binaries install as the agent user; OS packages are prepared in the agent image.

`infra/jenkins/Jenkinsfile.review` is a separate, explicit local candidate review. Its `travel-plan-review` agent has no Docker daemon or application secrets. It verifies a read-only Git archive and checksum at `/review`, runs Java/frontend/provisioning/configuration checks, and submits to the private `travel-plan-review` Sonar project using the scoped Jenkins credential `travel-plan-review-sonar`. Sonar's quality gate is required to pass. This is not a Git-host PR event or a deployment job.

On a 4 GB Docker runtime, stop the application/monitoring containers before starting the tools with `compose.tools.local.yml`; that overlay reduces Sonar web/compute heaps without disabling Elasticsearch checks. Restore the application after CI finishes. Keep the existing volumes. If Sonar itself restarts, restart `sonar-tls` as well because it shares Sonar's network namespace. Never run all profiles concurrently on this laptop.

## Building behind an organization TLS proxy

For Jenkins plugin downloads, set the same approved `BUILD_CA_FILE` and add
`-f compose.tools-ca.yml` after `-f compose.tools.yml` when building Jenkins.
The public roots and temporary trust store exist only in that build step;
the controller still runs as the unprivileged `jenkins` user.

For a CI agent behind the same proxy, provide the approved public PEM bundle
outside the source archive and set the node's `NODE_EXTRA_CA_CERTS` to that file.
Point Maven and the Sonar scanner at a temporary Java trust store containing both
standard roots and that bundle. The local review node uses its private CI setup
for these machine-specific paths; no organization CA or credential is committed.

If package downloads fail because this computer uses an organization TLS proxy,
export its already trusted root certificates to a PEM file and set
`BUILD_CA_FILE` to that file. Maven merges the bundle with its standard public
roots in a temporary in-memory build mount; the supplied CA and temporary
trust store are not copied into application images. TLS checks remain enabled.
Then build with
`docker compose -f compose.build.yml -f compose.build-ca.yml build`.
Use only roots approved for the build host; never disable certificate verification.
The optional BuildKit mount supplies trust to Alpine and npm downloads only.
It is absent from the final images and does not change application PKI.
See [Docker build secret mounts](https://docs.docker.com/build/building/secrets/).

`python scripts/start.py` (also used by `scripts/start.ps1`) builds the four images
sequentially, applies the bootstrap migration, and waits for runtime readiness.
It automatically uses the optional CA overlay when `BUILD_CA_FILE` is set.
Use `--no-build` only after building this revision, or `--replicas 2` on a host
with room for the base replicated topology. A failed stage stops startup and
preserves volumes. Neo4j's health check establishes Bolt listener readiness;
`verify-infrastructure.py` separately checks authenticated graph access over TLS.

## Automated owner sandbox verification

After configuring Vault and restarting the payments replicas, run `python scripts/verify-providers.py`. It requires successful Stripe and PayPal sandbox responses and writes a credential-free report under `work/verification/`. It never creates a charge or changes gateway records. See [the completion handoff](COMPLETION-HANDOFF.md) for service-specific Ansible deployment and remaining environment prerequisites.
