# Alpine ascent verification

The Whiteout reference was inspected at base, icefall and crossing positions in a live browser. The implementation uses original procedural terrain and copy, without copying reference assets.

Visual inspection covers the opening, crossing, horizon, 390px mobile opening and horizon, and the still fallback. Revisions lifted the final camera above the ridge and strengthened the mobile copy scrim. Desktop and mobile fallback posters are captured directly from the final 3D landscape. No pointer lock or capture is used.

The intended feeling curve (curiosity, immersion, release, agency) held after correcting the final camera position. The opening remains the strongest spatial change; the collection resolves it with real journey actions. The custom scene is isolated from account/payment state, lazy-loaded, GPU resources disposed on unmount, paused offscreen and while the document is hidden, and omitted for reduced motion. Geometry density and pixel ratio are capped on smaller screens.

Local checks: 89 React tests, production TypeScript/Vite build, and eleven Chrome E2E tests covering ascent controls, camera changes, static fallback, mobile overflow, photographic scenes, accessibility, traveler/manager pages and error handling. CI independently verifies Chrome and Firefox, Jenkins/Sonar and live infrastructure. The CI result is recorded on the PR, rather than claimed before it runs. Hardware 3D rendering was verified in local Chrome. Browsers lacking WebGL intentionally use the poster; no physical phone test is claimed.

Artifacts: work/verification/alpine-opening.png, alpine-crossing.png, alpine-horizon.png, alpine-mobile.png, plus chrome-ascent-*.png and the platform workspace screenshots. Unit test evidence is work/alpine-units.log.

The Three.js scene adds a lazy chunk of approximately 138 kB gzipped; the working application can load without it. No video encoding, remote model requests, generated image services or external fonts are needed at runtime.

The in-app browser reports reduced motion. The explicit Enable motion control overrides it for this experience, remembers the choice locally, and can return to the system preference. This override and persistence are covered by a browser regression. Hardware failure still selects the poster.
