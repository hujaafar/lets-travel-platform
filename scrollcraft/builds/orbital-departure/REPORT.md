# Orbital departure — verification

The topbar sample-data badge was removed at the user's request. Preview scope remains documented in the handoff, login and help. No live status was substituted.

The new first-screen scene is available at every viewport width. It uses native scroll, a locally textured WebGL sphere, independently moving star fields, a drawn orbit, changing typography, and a circular photographic descent into the featured journey. The earlier small-screen desk also has visible photo parallax and route drawing. Operational navigation, editing and export are retained.

Reference: https://arstraumur.music/. Inspected the live site at ground, Moon, Saturn and outer-space positions. Adapted the camera scale/position changes and atmospheric depth; no source, branding, models, audio or copy was copied. NASA imagery has separate local attribution.

Chrome 152: WebGL sphere renders; first-scroll change at 320, 390, 700, 820, 1024 and 1440 pixels; 12 orbital layout/axe cases passed, including 640px-high laptop and reduced motion. Chrome context loss switches to the photographic CSS fallback and context restoration resumes the shader. Firefox 155 under native Linux: WebGL is unavailable in this test environment, and the same tests passed through the CSS fallback. Do not describe that run as a Firefox WebGL test.

Direct chapter buttons, featured travel detail, skip focus, keyboard skip, persisted motion on/off, OS reduced-motion default, explicit motion opt-in, and navigation/remount passed. The existing 13-case design/workflow suite also passed in each browser. Four Vitest units and the production build passed. No external requests or uncaught page errors were recorded by either portable-preview suite. No real-device or screen-reader certification is claimed.

Visual checks cover the first frame, turning globe, route, aperture descent, arrival, phone composition, static composition, and short laptop viewport. A screenshot capture initially scrolled the overflowing decorative globe's ancestor sideways; this was caught by inspecting the images. The final stage uses overflow:clip and the test captures the viewport without scrolling decorative elements. Final contact-sheet frames show fully visible headings and controls.

No new dependencies, paid APIs, generated media, wheel interception, or idle animation loop. The renderer draws on scroll, resize, image readiness or fine-pointer input, suspends while offscreen/hidden, and releases observers/listeners/GPU objects on unmount. The upstream Scroll Craft engine is unchanged.

The original infrastructure caveats in docs/VERIFICATION.md still apply: Docker is offline, so these checks prove the portable sample frontend, not live Java services or payment-provider connectivity.
