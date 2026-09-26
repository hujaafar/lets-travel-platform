# Travel postcards verification

The new design uses the existing Uluwatu and Bali photographs. It carries over the reference's scale and spatial depth without reusing the snow terrain or reference assets. The window expands while the foreground postcard moves independently; the main action stays available throughout. Mobile uses a separate natural-flow composition.

Inspected local screenshots: opening, midpoint, resolved ocean view, login, collection, manager studio, mobile opening, destination spread and reduced-motion state. Viewports from 320 through 1440 pixels have no horizontal overflow. At mobile widths, the photograph begins below the copy with a measured gap. A physical phone has not been tested.

Local checks: 93 React unit tests; TypeScript/Vite production build; 11 Chrome browser tests covering scroll expansion, real destination filters, keyboard focus, trip dialogs, manager create/delete, responsive layouts, accessibility, motion pause persistence and explicit system-preference override. The final Docker dashboard was rebuilt and restarted against the existing backend. GitHub required Jenkins/Sonar and Chrome/Firefox live checks provide the independent final result on the PR.

Motion can be paused for the whole traveler workspace and the choice persists. System reduced motion starts with a complete static layout. Existing explicit opt-in migrates; blocked browser storage still allows session controls. Ambient work pauses offscreen and when the document is hidden. No autoplaying destination carousel or intercepted wheel/touch input is used.

The retired alpine component, generated snow posters and Three.js dependency are removed. The application entry bundle is approximately 84 kB gzip; no separate 3D engine download is required. Images and fonts are served locally. Existing API authorization, payment and booking behavior is unchanged.

Evidence is in work/verification/postcards-*.png and chrome-travel-*.png. CI logs and artifacts are retained with the pull request rather than represented as already passed in this source document.
