# Phase-two architecture

Browser → Caddy TLS gateway → identity / travel / payments services. Every service verifies session identity/role; writes also require the expected Origin and CSRF token. Session verification uses a private authenticated TLS listener. PostgreSQL is authoritative; Elasticsearch and Neo4j are retryable projections.

| Service | Responsibilities | Routes |
|---|---|---|
| Identity | Registration, sessions, administrator account management | `/api/auth/*`, `/api/users` |
| Travel | Catalog, owned itineraries, search, recommendations, feedback, reports, statistics | `/api/explore*`, `/api/manage*`, `/api/managers*`, `/api/feedback`, `/api/reports*`, `/api/profile` |
| Payments | Gateways, checkout, bookings, reconciliation/refunds | `/api/payments*`, `/api/checkout/methods`, `/api/bookings*` |

Legacy `/api/travels`, `/api/users`, `/api/payments` stay administrator-only. Travelers use member routes; managers add `/api/manage`; admins can use every role. Legacy VIEWER is not a traveler. Signup always creates TRAVELER; only administrators grant elevated roles.

## Data and concurrency

The inherited shared PostgreSQL instance has separately owned schemas and restricted runtime users. Explicit cross-schema grants support references and joins. This coursework tradeoff is not independent database-per-service deployment.

Trips reference a manager; ordered stops store destination, country, activities, accommodation and transportation. Bookings snapshot price/currency and retain session, capture and refund references. A partial unique index prevents duplicate active user/trip bookings; travel-row locking serializes capacity checks. SQL triggers also prevent legacy admin APIs from moving booked dates, transferring ownership, unpublishing or reducing capacity below active reservations.

Feedback is unique per user/trip and requires a confirmed booking on a completed trip. Reports are visible only to the author and administrators; managers’ public report counts include reviewed reports, not unverified accusations. Confirmed group members can see names, never each other’s emails or financial records.

## Search and recommendations

SQL outbox events cover trip, booking and feedback changes. The scheduled projector replaces the same Elasticsearch document and Neo4j node, acknowledging only after both succeed. Retries are idempotent.

Elasticsearch uses `search_as_you_type` with `multi_match` / `bool_prefix` on root, two-gram and three-gram fields. Title, description and all stop fields are searchable. Result IDs are rechecked against SQL publication/date rules.

Neo4j `Member → ATTENDED → Offering` edges carry rating weight (rating / 5; 3 / 5 without feedback). Completed trips contribute matches on **country, activity and transportation**. Already booked trips are excluded. New travelers see a labeled chronological discovery collection, not a fabricated personal score.

## Payments

`PENDING → CONFIRMED` requires provider verification. `PENDING → CANCELLED` follows verified expiry/cancellation. `CONFIRMED → CANCEL_REQUESTED → REFUNDED` requires the original provider’s completed refund. Cancellation commits before external calls; the reconciliation worker retries interruptions every 30 seconds. Stable idempotency keys protect provider creation, capture and refund requests. Refund IDs are stored and polled.

The browser cannot supply a price, currency, provider payment ID or confirmed state. PayPal capture is server-side after approval. Stripe uses hosted card checkout in test mode. Closing checkout or visiting the return page does not create membership. Provider outages retain a pending state and capacity; an ambiguous operation beyond provider idempotency retention needs operator reconciliation before charging again or releasing the seat.

## Analytics

Monthly income covers confirmed bookings in the last six calendar months, grouped by currency, excluding cancellations/refunds. Manager score is `average rating × 20 + min(confirmed bookings, 100) + min(verified USD income / 100, 100)`; money remains separately grouped by currency. Personal statistics cover completed trips, cancellations/refunds, reports and methods used in confirmed bookings.
