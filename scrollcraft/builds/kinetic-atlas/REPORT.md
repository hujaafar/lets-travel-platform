# Kinetic Atlas · motion verification

This is the user's requested expansion of Departure Desk: “MORE ADVANCE AND MORE SCROLL EFFECTS MORE CRAZY”. The existing brand, six admin screens and working forms remain connected to their original application callbacks. The brief records the continuing creative delegation.

## Implemented sequence

The opening uses a finite native sticky runway. Its rounded photographic frame opens and grows, while the foreground ticket translates and turns independently, the seal rotates, a route line draws, and a moving arrow follows the same cubic path. Fine-pointer movement adds depth without pointer capture. The title drifts in separate directions, and a direct itinerary control bypasses the scene.

A quiet row of actual counts leads into travelling destination lettering. The itinerary changes to a dark photographic spread with directional image reveals and a changing route bookmark. Saved journeys become a sideways exhibition: native vertical travel equals the measured horizontal distance, each photograph pivots according to its position, and useful detail controls remain available. Previous/next buttons and keyboard focus reveal the corresponding plan. The ending holds an oversized heading, a rotating photographic orbit and real creation/export actions.

Mobile uses direct document flow, a shorter cover composition and a native swipeable gallery. Reduced motion removes the pin spans and transforms and displays all saved journeys in normal flow. Empty collections do not acquire a tall pinned gap.

## Verification and fixes

The final portable preview passed on Chrome 152 and native Linux Firefox 155. Assertions read real transforms, SVG stroke progress and card bounds. They cover frame expansion, the drawing flight path, pointer depth, independent planes, stop selection, direct itinerary navigation, horizontal gallery movement, previous/next controls, keyboard revelation of the last card, native mobile gallery layout, reduced motion and a visible closing action.

Thirteen automated axe/overflow cases per browser passed with no violations: normal motion at 320/390/820/1024/1440 pixels, reduced-motion overview at 320/390/1440 pixels, and five other mobile screens. Local travel creation, editing, search, reload persistence, deletion and CSV export passed; zero/one-plan layouts also passed. There were no uncaught page errors or external HTTP requests. Four frontend unit tests, the TypeScript build and an unused-local/parameter check passed.

Visual review found and corrected a clipped keyboard-focused gallery card, an obsolete CSS class that hid the last card at intermediate widths, and a ticket that extended beyond Firefox's tablet viewport. Firefox also required explicit length units for the calculated SVG dash offset. These were fixed in the implementation without dropping the assertions. Hero entry/exit, both route destinations, gallery entry/end, phone gallery and closing frames were inspected. The recording provides continuous evidence between those captures.

The intended emotional curve is anticipation, orientation, immersion, discovery and agency. The final scene sequence supports that progression: the strongest collection change is lateral, its photographs remain specific to saved plans, and the closing controls settle visibly. There is no unbroken camera flight, wheel hijacking or invented numerical data.

## Implementation and limits

The upstream Scroll Craft engine remains unmodified. The React adapter owns passive listeners, media-query listeners and observers, queues one frame per input, and cleans them up on navigation. React state updates when the selected stop/card changes, rather than on every animation frame. No new animation package, generated footage or paid asset service was added.

Headless viewport checks do not certify physical touch devices, Safari or screen readers. The portable preview contains fictional local data; these results do not claim backend availability. Docker remains offline from the earlier environment failure. Earlier Java and live integration evidence, and pending infrastructure work, are recorded separately in `docs/VERIFICATION.md`.
