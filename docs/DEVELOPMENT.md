# Local development

## Prerequisites

Install Git, Python 3.10+, a JDK with `keytool`, and Docker with Compose v2. Allocate at least 4 GB of Docker memory to the application. Jenkins, SonarQube, and monitoring require additional resources; hosted CI runs them separately.

From the repository root:

```bash
python -m pip install -r scripts/requirements.txt
python scripts/start.py
python scripts/seed-platform.py --rich
```

`start.py` builds images sequentially, initializes PostgreSQL and Vault, provisions local certificates and service credentials, and waits for container readiness. It uses one replica per Java service by default. Use `--replicas 2` for the replicated configuration, or `--no-build` when images already match the current application source.

## Accounts and access

Open [https://localhost:8444](https://localhost:8444).

| Workspace | Credentials |
| --- | --- |
| Administrator | `.secrets/admin-login.txt` |
| Manager and traveler | `.secrets/demo-login.txt` |
| Additional seeded accounts | `.secrets/demo-people.json` |

Passwords are generated locally. Public registration creates a traveler account; only an administrator can assign manager or administrator roles. The generated files contain private credentials and must remain outside Git, screenshots, and CI artifacts.

## Local certificates

Bootstrap creates the development CA at `.secrets/ca.crt`. Inspect and trust this CA in your development browser or operating system if you need a warning-free localhost connection. The application does not install it automatically. Do not disable service certificate verification or use this local CA for public hosting.

Services verify TLS internally for PostgreSQL, Vault, Elasticsearch, Neo4j, and session verification. See [security boundaries](PLATFORM-SECURITY.md) for the current controls.

## Existing installations

The Compose project is named `lets-travel` and listens on port 8444. Run one checkout against that stack at a time. An existing stack's `.secrets/`, `.env`, PostgreSQL, and Vault volumes form a matching deployment: retain them together when moving the checkout. Generating different passwords against an existing database can prevent startup.

Stop unrelated stacks if Docker memory is limited. Use `docker compose stop` to preserve data. `docker compose down -v` removes named volumes and must not be used as routine cleanup.

## Payment configuration

This application uses Stripe test mode and PayPal sandbox accounts. Create an operator-owned JSON file outside the repository:

```json
{
  "STRIPE_SECRET_KEY": "sk_test_REPLACE_ME",
  "PAYPAL_CLIENT_ID": "REPLACE_ME",
  "PAYPAL_CLIENT_SECRET": "REPLACE_ME"
}
```

Replace the placeholders with your own sandbox credentials. Import the file from the repository root:

```bash
python scripts/configure-sandbox.py --file /private/path/provider-credentials.json
docker compose restart payments
python scripts/verify-providers.py
```

The import updates the payments secret in Vault and restarts its agent. Restart the payments service after the agent renders the updated configuration. Then enable the relevant gateway through **Administration → Payments**.

Provider authentication, checkout creation, and settled payment are separate checks. `verify-providers.py` checks credentials. `verify-checkout.py` creates sandbox checkout sessions and checks unpaid cancellation; it does not settle a buyer payment.

Stripe sandbox confirmation and refund were verified during development. PayPal authentication and order creation were verified; complete buyer approval, settlement, and refund remain unverified. See [payment verification](DEMONSTRATION.md#prove-payments) for the full manual flow.

## Development data

`seed-platform.py --rich` adds fictional accounts, journeys, reviews, and explicitly labeled booking examples. Repeated inserts preserve existing rows. Demo bookings have no provider capture/refund references and are excluded from reconciliation. Their displayed status does not establish a real payment.

Run `python scripts/verify-demo.py` to check the dataset. See [activity fixtures](DEMO-ACTIVITY.md) for counts and protections.

## Inspect the running stack

```bash
docker compose ps
python scripts/verify-infrastructure.py
python scripts/verify-platform.py
docker compose logs --since 5m identity travel payments
```

Infrastructure verification checks TLS, service readiness, runtime database privileges, and graph convergence. Platform verification creates isolated temporary fixtures, exercises role and discovery workflows, and cleans up its fixtures. Run it against a development deployment.

### Common startup problems

| Symptom | Check |
| --- | --- |
| Docker is unavailable | Start Docker Desktop and confirm `docker info` succeeds. |
| Port 8444 is occupied | Stop the other checkout or service using the port. |
| Vault is sealed after restart | Run the startup script to unseal the existing Vault using its matching private configuration. |
| A service waits for configuration | Inspect its Vault agent logs; preserve the matching secrets and volumes and rerun startup. |
| Containers exit with code 137 | Inspect Docker memory and stop unrelated workloads before restarting. |
| Browser reports an untrusted localhost certificate | Inspect and trust the generated development CA in your browser. |

## Testing

Run Java tests with `./mvnw test` or `./mvnw.cmd test` on Windows. Run Python tests with `python -m unittest discover -s scripts/tests -v`. From `dashboard/`, run `npm ci`, `npm test`, and `npm run build`.

With the application running, install Playwright Chromium/Firefox and run `npm run test:e2e` from `dashboard/`. Windows skips POSIX-only permission checks; Linux CI runs them. CI uses fresh private credentials and never receives provider sandbox secrets.

For deployment and quality-gate details, see [GitHub workflow](GITHUB-WORKFLOW.md) and [operations scripts](../scripts/README.md).
