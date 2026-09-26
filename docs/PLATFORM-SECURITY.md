# Security boundaries

- Secure, HttpOnly, SameSite Strict session cookies; BCrypt passwords; login throttling; immutable public signup role.
- Origin/CSRF checks on writes and server-side role/ownership checks on trips, bookings and reports.
- TLS for browser/service, PostgreSQL, Vault and Elasticsearch traffic; encrypted Bolt for Neo4j. Generated development CA for localhost.
- Database services are private; public endpoints bind loopback. Runtime SQL users cannot change schema definitions. Vault AppRoles isolate secrets; the Elasticsearch indexer is limited to `journeys`.
- Card details stay on Stripe/PayPal hosted pages. No PAN/CVV, provider secret or raw authentication token is returned to the browser or stored in payment records.
- Group member lists expose names only to confirmed members. Reports are private to authors/admins. React renders feedback and report text without raw HTML.
- Financial history supports reconciliation and retention. Operator-managed deletion/anonymization decisions are still needed; this project does not claim GDPR or PCI DSS certification.

Before a public launch, add a real domain/managed TLS, tested backups and HA, supported restricted Neo4j authorization, production monitoring, signup abuse controls, retention/privacy notices, incident procedures, business payment accounts and verified webhooks. Neo4j Community has more limited access controls than Enterprise. These are deployment boundaries, not claims of production readiness.

## Demonstrating real payment behavior

API-key validation, hosted checkout creation and completed settlement are different checks. `verify-providers.py` tests authentication. `verify-checkout.py` tests hosted creation, retry and unpaid cancellation. To demonstrate settlement, approve a **sandbox** payment, verify `CONFIRMED` in this app, match the reference in the provider sandbox dashboard, cancel before the cutoff and verify `REFUNDED`.

Never use real cards or real money for the coursework demo. Do not manually mark a payment confirmed to make a demo pass. Integration fixtures are labeled and removed.
