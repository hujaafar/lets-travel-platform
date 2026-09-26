# Demo activity

After normal bootstrap and migration, run `python scripts/seed-platform.py --rich` to add the extended fictional dataset. Run `python scripts/verify-demo.py` to check fixture counts, repeatability, ledger authorization and read-only booking behavior. CI performs both steps against its isolated stack.

The seed adds 18 itineraries (12 upcoming published, 2 drafts, 4 past), 64 demo bookings spanning five payment states, 16 demo reviews, 10 fictional accounts and 3 report scenarios. IDs are deterministic; inserts never replace existing rows. Account passwords are generated and stored only in ignored `.secrets/demo-people.json`; existing demo-account logins are unchanged. Dates are chosen on first insertion and stay stable on later runs.

Browse Discover, My journeys, Manager studio and My profile. Administrators can open Payments → Transaction history, search traveler/journey/reference, and filter status. The ledger returns the latest 200 bookings and requires administrator access. Demo rows carry a visible badge; aggregate screens note when examples are included. Demo trips remain usable as itinerary examples; newly created sandbox bookings remain ordinary provider-backed records.

A demo booking has `is_demo=true` and no checkout URL, provider ID, capture ID or refund ID. Reconciliation excludes it, processing returns without provider I/O, and cancellation is rejected with a clear read-only message. Status labels on these rows illustrate UI states; they are not evidence of a Stripe/PayPal charge or settlement. Provider sandbox integration remains separate.

Motion is always enabled while browsing, with no pause/enable toggle or stored preference. Decorative hero animation sleeps when its scene is offscreen or the tab is hidden, then resumes automatically. Search, account navigation and booking forms remain usable.
