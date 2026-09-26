# Motion implementation and verification

This updates the existing Let’s Travel platform using the scroll-craft principles recorded in BRIEF.md. It does not replace the booking UI with a marketing-only page.

- Hero: landscape scale/translation, independently moving typography and contour rings.
- Collection: staggered vertical entry and photographic mask reveals. Text remains fully opaque.
- Scenic route: a native-scroll sticky scene with three real destinations, photographic wipes, a traced route and working itinerary buttons. Direct selectors provide an alternative to scrolling.
- Manifesto: lateral typography and independent background arrow movement.
- Workspaces: matching page/dialog entry motion; administration inherits the same timing. Navigation stays sticky and a thin progress bar shows page position.
- Reduced motion: no parallax/pinning/entry animation; destination buttons still work in a static scene.

No video, generated assets, WebGL, scroll hijacking or pointer capture. The skill preflight cannot find FFmpeg; the implemented photo/SVG/CSS workflow does not encode video. Browser tests use the existing Playwright installation.

The motion E2E suite checks changed hero transforms, three actual scroll positions, destination selection, functioning itinerary dialogs, accessibility, a 390px viewport and reduced motion. Screenshots are generated under `work/verification/*-motion-*.png`. Chrome verification passed locally; the PR's required checks verify Firefox on Linux as well. A physical phone has not been tested.

Visual review found and corrected a transient light-on-light destination label caused by animating background without text color. The resolved scene now switches colors atomically. The intended feeling curve held in desktop and phone screenshots: anticipation → control → photographic change → calm → a useful journey action. The scenic route is the single strongest motion moment.
