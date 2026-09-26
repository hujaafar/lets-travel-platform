# API reference

Base URL: `https://localhost:8443/api`. Requests and responses use JSON. Mutations require the exact configured `Origin` and `X-CSRF-Token` from the authenticated session. `tp_session` is a Secure, HttpOnly, SameSite=Strict cookie. Never put passwords, cookies, or CSRF tokens into logs or query strings.

| Method | Path | Result / access |
|---|---|---|
| POST | `/auth/login` | `{email,password}` → current user and CSRF token; sets session cookie |
| GET | `/auth/me` | Current account and CSRF token |
| POST | `/auth/logout` | Revokes the session, clears cookie, 204 |
| GET | `/users` | Accounts without password hashes; ADMIN |
| POST | `/users` | Create account, 201 `{id}`; ADMIN |
| PUT | `/users/{uuid}` | Update account; ADMIN |
| DELETE | `/users/{uuid}` | Delete account and cascade; ADMIN |
| GET | `/travels` | Saved itineraries, stops, participant IDs, duration and version |
| POST | `/travels` | Create itinerary, 201 `{id}`; ADMIN |
| PUT | `/travels/{uuid}` | Update if supplied version matches; ADMIN |
| DELETE | `/travels/{uuid}` | Delete itinerary and enqueue graph deletion; ADMIN |
| GET | `/travels/graph-status` | `{pending}` graph outbox count |
| GET | `/payments` | Gateway metadata and configuration status |
| POST | `/payments` | Create gateway, 201 `{id}`; ADMIN |
| PUT | `/payments/{uuid}` | Update gateway; ADMIN |
| DELETE | `/payments/{uuid}` | Delete gateway; ADMIN |
| POST | `/payments/{uuid}/test` | Verify sandbox credentials; ADMIN |

Updates and deletes normally return an empty HTTP 200 body. Standard errors contain `{ "message": "..." }` with 400 for invalid input, 401 for no session, 403 for permission/CSRF/origin rejection, 404 for absent records, 409 for stale/conflicting writes, 429 for login lockout, and 503 when provider credentials are absent. The gateway does not expose `/internal/*` or actuator endpoints.

All business reads and mutations require ADMIN, including graph status. VIEWER and TRAVEL_MANAGER remain assignable account roles for future phases, but have no access to this admin API or dashboard. Login, own-session inspection/logout and private health/service authentication are the necessary exceptions.

## User payload

```json
{"name":"Example traveller","email":"traveller@example.test","role":"VIEWER","status":"ACTIVE","password":"replace-with-a-long-password"}
```

Roles: ADMIN, TRAVEL_MANAGER, VIEWER. Status: ACTIVE or SUSPENDED. On update, omit or leave password blank to preserve it. A new password must have at least 12 characters and fit within 72 UTF-8 bytes; it revokes existing sessions. Oversized values are rejected before BCrypt hashing and are never truncated.

## Travel payload

```json
{
  "title":"A considered journey",
  "startDate":"2027-01-10",
  "endDate":"2027-01-15",
  "status":"DRAFT",
  "price":1800.00,
  "capacity":12,
  "description":"Time to explore at your own pace.",
  "image":"bali",
  "stops":[{"destination":"Ubud","country":"Indonesia","activities":"Cooking workshop","accommodation":"Boutique hotel","transportation":"Private transfer"}],
  "participantIds":[],
  "version":0
}
```

Read responses retain SQL `start_date`/`end_date` naming; write DTOs use `startDate`/`endDate`. Duration is inclusive and computed, never accepted from the client. Status: DRAFT/PUBLISHED/ARCHIVED. The image is an allowlisted local asset key, not an external URL. Maximum 30 stops. Money uses PostgreSQL decimal and Java BigDecimal; the travel catalogue is denominated in USD.

## Gateway payload

```json
{"name":"Stripe checkout","provider":"STRIPE","currency":"USD","enabled":false}
```

Providers: STRIPE/PAYPAL. Supported configuration currencies: USD/EUR/GBP. This metadata does not perform currency conversion or payment settlement. `configured` indicates credential presence; only the explicit test verifies the provider response.
