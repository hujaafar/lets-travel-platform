# Review and demonstration

## Start and sign in

Run `python scripts/start.py --replicas 2`, then `python scripts/seed-platform.py`. Open https://localhost:8444. The administrator login is generated in `.secrets/admin-login.txt`; the fictional manager and traveler logins are in `.secrets/demo-login.txt`. Those local files must never be published. Use the generated development CA, not disabled TLS verification.

The original Travel Plan repository and its Docker volumes are separate. On a laptop with 4 GB assigned to Docker, stop the other project before starting this one; do not delete its volumes. Jenkins/Sonar and full browser checks run on separate disposable GitHub runners.

## Show the roles

1. **Traveler:** open Discover, search for a destination or activity and select an autocomplete suggestion. Open a journey to inspect dates, itinerary, accommodation, transport, manager profile and feedback. Book using an enabled sandbox provider. My journeys shows payment verification, cancellation and completed-trip feedback. My space shows personal statistics and submitted reports.
2. **Manager:** open Manager studio. Create a journey with multiple stops, publish it, edit it and inspect the subscriber list. Only the owner (or an administrator) can edit that journey. Subscriber cancellation uses the same cutoff and refund rules as traveler cancellation. Analytics shows verified income and attendance; canceled/refunded money is excluded.
3. **Administrator:** open Manager studio for global rankings and income; open My space for report moderation. Administration opens user, itinerary and payment-method management. Public registration never grants an administrator or manager role.

New travelers receive a clearly labeled discovery collection. Personalized Neo4j recommendations require completed participation. The integration script creates explicitly marked, removable fixtures to prove matching by country, activity and transportation, weighted by feedback; these fixtures are not presented as real payments.

## Prove payments

Credentials working, checkout opening and payment completing are three separate checks:

- `python scripts/verify-providers.py` verifies Stripe and PayPal sandbox authentication.
- `python scripts/verify-checkout.py` opens real sandbox checkout sessions, verifies repeat requests do not duplicate bookings, rejects unpaid confirmation and cancels the unpaid bookings.
- Complete a provider-hosted **sandbox** checkout as a test buyer. Return to My journeys and use Verify payment. The server must produce `CONFIRMED`, with a corresponding provider transaction. Cancel before the cutoff and verify `REFUNDED`, matching the provider refund.

Stripe's test-card checkout, booking confirmation and refund were exercised during implementation. PayPal authentication, hosted checkout and unpaid cancellation were exercised against its sandbox; capture/refund HTTP contracts are tested with mocks. A completed PayPal test-buyer approval and refund is still a separate demonstration. Never use real money or manually update SQL to claim payment success.

Bookings/cancellations close three days before departure at 00:00 UTC; new checkout creation closes an additional hour earlier. Failed or uncertain payments retain their pending state for reconciliation. Payment-history trips are archived, preserving the audit trail.

## Verification evidence

The GitHub PR has two checks: `lets-travel/jenkins` runs the actual Jenkins pipeline and SonarQube gate; `lets-travel/live-tests` provisions with Ansible and exercises the real services, Chrome, Firefox, accessibility, restart safety, failover and concurrent load. Inspect the check status and attached artifacts for the commit you are submitting.

Local results are written beneath `work/verification/`, Maven `target/surefire-reports/`, and `dashboard/playwright-report/`. They are generated outputs, not checked-in pass certificates. The current Java suite has 204 tests; the React suite has 89. Windows skips five POSIX-only Python checks; Linux CI runs them. Firefox runs in Linux CI because this Windows installation refused to launch Playwright's Firefox binary.

Optional PWA and translations are not implemented. Production HA, managed TLS, legal/compliance review, retention operations and independent human PR approval are not claimed by passing automated tests.
