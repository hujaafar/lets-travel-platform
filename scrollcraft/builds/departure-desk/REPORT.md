# Departure Desk · final design report

The user rejected the first dashboard direction and explicitly delegated a stronger design with scroll effects. The self-authored brief records that evidence and the decisions taken from it. The previous fingerprint is retained and labelled rejected; this build differs in grammar, navigation, opening, sequence, close and signature.

## What was built

An editorial working desk in paper, charcoal and vermilion. Fraunces gives the itinerary spreads a distinctive display voice; DM Sans keeps operational forms and labels consistent. The opening separates the photographic plane, frame, printed departure ticket and subtly rotating seal. All copy remains semantic HTML. A sticky photographic bookmark selects a destination, changes the photograph and progresses the route while the reader moves through real itinerary details. Saved journeys use offset portrait photography. The large closing action opens the actual travel editor.

The rail keeps the six application screens available. Phones receive a separate composition: the ticket becomes an attached caption and the itinerary becomes a direct list. Reduced motion removes parallax, reveals and sticky extra space. Keyboard focus reveals any destination card immediately. No wheel interception, autoplay audio or empty scroll spans.

The same React interface runs against Java in the application and against an explicitly labelled local sample adapter in the portable preview. Preview edits stay in local storage; provider connections are unavailable there. The four-stop overview excerpt links to the complete itinerary editor rather than truncating saved records.

## Skill adaptation

Scroll Craft's complete skill and original engine sources are preserved. The new build also contains an unmodified reference engine copy. The application uses its own small React progress hook with cleanup, one queued animation frame and native observers because the upstream standalone engine has no component disposal lifecycle. The hook does not modify the upstream engine. Verification reads actual computed transforms and visible destination labels rather than treating metadata as proof of motion.

The preflight found Node and Chrome. Playwright is installed in the dashboard package. A full video-encoding ffmpeg build and a Kie key were not available; no video generation or encoding was required for this still-photograph composition. No paid assets or generation calls were made. Playwright's browser recorder supplies the handoff recording. This is a documented application adaptation, not a claim that the complete cinematic-video preflight passed.

## Verification and visual findings

The exported package passed on Chrome 152 and native Linux Firefox 155, including independently changing cover transforms, stop selection and route navigation, a static reduced-motion view, three widths, all six screens, local travel CRUD, persistence, search and CSV export. There were zero external HTTP requests or uncaught page errors. Eight axe and overflow cases passed in each browser. The final build and four frontend unit tests passed.

Inspection prompted higher-contrast small labels, a labelled workspace icon, an accessible heading with proper word spacing, a keyboard-safe reveal rule and separate Ubud/Uluwatu photographs. An immediate screenshot caught the closing copy before the browser's paint settled; waiting for the completed scroll produced the intended visible close without changing its layout. Final contact-sheet captures wait for reveal transitions instead of recording their faint initial state.

Reading the final sequence gives anticipation, orientation, understanding, curiosity and agency, matching the authored brief. The strongest change is the itinerary photograph and route advancing together, with the longest purposeful reading span. The final screen holds visible copy and useful actions.

The handoff includes first-view desktop and mobile captures, intermediate cover/route/close captures, full-page and editor captures, a contact sheet, a motion recording and separate browser JSON reports. Screenshots show the exported interface with sample data, not proof of current backend uptime.

## Limits

Real phones, Safari and screen readers have not been exercised. Java live validation was interrupted by Docker failure after the disk filled; it has not been rerun for the redesigned frontend. Jenkins, Sonar, Ansible, replica failover and provider connectivity still require their documented environment checks. See `docs/VERIFICATION.md`; no production high-availability claim is made.
