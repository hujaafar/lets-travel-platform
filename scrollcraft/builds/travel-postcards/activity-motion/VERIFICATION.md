# Verification: demo activity and motion

Local checks on the revision:
- Added 18 trips, 64 demo bookings, 16 marked reviews, 10 fictional people and three report scenarios. Repeated seeding preserved row counts and existing data.
- Live admin ledger returned the new examples; traveler and anonymous access were rejected. Verifying/cancelling demo bookings left their database state unchanged and no provider identifiers were created.
- Java tests pass; React suite passes 96 tests. Python suite passes 48 tests with five pre-existing environment-dependent skips.
- Chrome exercised hero opening/middle/arrival, destination filters, dialog selection, explicit pause, always-enabled initial state under reduced-motion media, personal booking history and transaction search/status filters. Axe checks passed for hero, destination scene and transaction ledger.
- Visually inspected desktop opening/arrival, mobile opening, manager page and admin transaction history. Widths 320, 375, 760, 768 and 1024 had no horizontal overflow; mobile headline/action and photo remain separated.
- The floating postcard animation now includes resting phases and pauses on hover/focus so its actual hit target can be clicked reliably.

Required GitHub CI runs the full Chrome/Firefox regression suite, Jenkins unit/coverage checks and SonarQube gate before merge. Screenshots and raw local results live in ignored work/verification; private account credentials are not committed.
