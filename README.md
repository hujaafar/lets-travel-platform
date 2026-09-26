# Let’s Travel

A role-aware travel platform built on the Travel Plan foundation. Java 17 / Spring Boot, React / TypeScript, PostgreSQL, Neo4j, Elasticsearch, Vault, Docker, Ansible, Jenkins and SonarQube.

Travelers discover journeys, use autocomplete and personalized recommendations, book through Stripe or PayPal sandbox checkout, cancel before the cutoff, review completed trips and report concerns. Managers own their itineraries, manage subscribers and track income. Administrators oversee the platform and can use both experiences.

## Run locally

Requires Docker Compose, Python 3.10+, a JDK with `keytool`, and approximately 4 GB available to Docker for the laptop profile. The separate `lets-travel_*` volumes do not modify the original Travel Plan deployment.

```sh
python -m pip install -r scripts/requirements.txt
python scripts/start.py
python scripts/seed-platform.py
```

Open **https://localhost:8444**. Generated administrator credentials are in `.secrets/admin-login.txt`; fictional manager/traveler credentials are in `.secrets/demo-login.txt`. Never commit these files. Trust `.secrets/ca.crt` locally after checking its origin. `/admin` opens the administration dashboard.

`start.py` builds images, generates local certificates and secrets, initializes Vault, provisions the restricted Elasticsearch indexer and starts one replica of each application service. Use `python scripts/start.py --replicas 2` for the replicated profile. Bootstrap and volumes are reusable; do not delete them to restart.

## Sandbox payments

Put `STRIPE_SECRET_KEY` (`sk_test_…`), `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in an operator-owned JSON file, then:

```sh
python scripts/configure-sandbox.py --file /private/path/provider-sandbox.json
docker compose restart payments
```

Enable gateways from Administration → Payments. The app uses sandbox endpoints. Card details are entered on provider-hosted pages; the app stores references, amounts and payment states. A return URL never confirms a booking: the server verifies provider state, amount, currency and booking identity. Background reconciliation retries interrupted checkouts and refunds.

Bookings and cancellations close **three days before departure, at 00:00 UTC**. Checkout creation closes one hour earlier to allow session expiry before the cutoff. A seat remains reserved while payment/refund state is uncertain. Trips with payment history are archived rather than deleted.

## Verify

```sh
./mvnw test                         # Windows: .\mvnw.cmd test
cd dashboard
npm ci
npm test
npm run build
npx playwright install chromium firefox
npm run test:e2e
cd ..
python -m unittest discover -s scripts/tests
python scripts/verify-platform.py
python scripts/verify-providers.py
python scripts/verify-checkout.py
```

The last two commands require owner sandbox credentials. `verify-checkout.py` enables sandbox gateways and creates/cancels real hosted checkout sessions without paying. `verify-platform.py` uses real services and marked database fixtures for completed-trip rules, removing its fixtures afterward. Neither represents a fixture as provider-settled money.

See [phase-two status](docs/PHASE-TWO.md), [architecture/API](docs/PLATFORM.md) and [security boundaries](docs/PLATFORM-SECURITY.md). Other documents are marked phase-one references. Inherited Kubernetes manifests are examples, not the supported phase-two deployment path.

## CI and collaboration

GitHub runs Jenkins/SonarQube and live integration jobs. Tests include Java, React, real service APIs, browser accessibility, Chrome/Firefox, Ansible deployment and replica behavior. Provider secrets stay outside untrusted PR jobs. Changes go through PRs; automated checks are not an independent human approval or a compliance certificate.
