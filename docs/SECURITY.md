# Security decisions

Implemented protections:

- Server-side sessions with random 256-bit cookie tokens; only SHA-256 hashes are stored. Cookies are Secure, HttpOnly, SameSite Strict, path `/`, and expire after eight hours.
- BCrypt work factor 12; passwords are validated against its 72-byte UTF-8 limit before hashing. No plaintext account passwords in database rows or API responses.
- CSRF token and exact-origin checks for all browser mutations. Login is origin-checked too.
- All business reads and writes require ADMIN server-side. Non-admin accounts may only authenticate and inspect/close their own session in this phase. The dashboard also rejects non-admin entry; the shared filter is the authorization boundary.
- Current session/user status verified through identity for every protected request. Password resets revoke sessions; deleted users lose access immediately.
- Login throttling shared in PostgreSQL, rather than an independent in-memory counter per replica.
- Parametrized JDBC queries, validated fields, immutable IDs, constrained roles/statuses and allowlisted asset identifiers.
- Protected internal session verification, never routed by the public gateway.
- TLS at the gateway, Java services, PostgreSQL, Neo4j, Vault and external providers. PostgreSQL rejects non-TLS TCP connections.
- Separate runtime schema permissions, non-login schema owners, and non-root Java containers.
- Network-scoped least privilege for Neo4j: it has no native fine-grained roles in the Community edition (that requires a commercially licensed Enterprise/Aura tier, which this project does not hold), so instead only `travel` — the one service that ever queries the graph — is attached to Neo4j's Docker/Kubernetes network. `identity` and `payments` cannot resolve or reach it at all, verified live in `scripts/verify-infrastructure.py`.
- Vault AppRoles can read only their own service configuration. Secrets are not built into Docker images or committed.
- Request-ID sanitization and propagation; no password or cookie logging. Security headers reject framing and limit content sources.
- No real payment collection or card storage; provider testing uses sandbox credentials.

## Production work

The local CA, one-node databases, one-share Vault recovery, bootstrap credential copies, and loopback tool ports are deliberate development choices. A public release needs managed certificates and renewal, redundant ingress, database replication and restore drills, production Vault auto-unseal and custody, edge rate limits, alerting, tenant/data privacy requirements, audited secret rotation, and an approved payment/webhook design.

The simple email-based login throttle reduces password guessing, but is not a substitute for distributed edge/IP limits and abuse monitoring. The current shared internal verification key should be replaced with per-service mTLS identity when the platform grows. Successful authentication uses live identity calls; identity unavailability fails closed.

No compliance certification, penetration test, load test, or independent PR approval is implied by this project. Report suspected issues privately to the project maintainers rather than including credentials in a public issue.
