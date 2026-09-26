# Let’s Travel: The Great Outside

Self-authored under explicit creative delegation. This is a revision of the existing application, using the user's new reference: https://whiteout.overvac.com/ . The user asks to make the same design and calls it "creazy". Existing booking, accounts, managers and administration remain working.

- Vibe: authored as cold, expansive, atmospheric, adventurous.
- Journey: a continuous alpine opening, useful collection, changing destination photographs, a personal invitation, recommendations and working footer.
- Energy: atmospheric opening → growing spatial movement → open horizon → calm selection.
- Feeling: curiosity from the dark landscape; immersion as the camera follows a rope through snow; release as the horizon opens; agency through real bookable journeys.
- Peak: "It's the site where I climb through the mountains before choosing my next trip." The continuous opening has the greatest scroll span.
- Range: cinematic and technical typography, cool slate surfaces, snow-white text, restrained warm rope accent.
- Structure: continuous 3D opening with direct chapter controls, followed by the existing working journal. Not a full-document worldflight, because the product must still support search and booking.
- Assets: original procedural terrain, physically anchored route, rendered snow, existing authorized destination photographs. No Whiteout source, models, text or assets copied. No generated video or image API.

Observed Whiteout: full-screen perspective terrain, continuous camera movement, snow foreground, sparse uppercase copy, mono route rail. The principle adapted is spatial travel under native scroll control. Our original three chapters are departure, crossing and horizon, without invented elevation/oxygen measurements.

Layer contract: perspective sky and distance fog; detailed vertex-colored mountain terrain; anchored expedition rope and markers; independently animated foreground snow; semantic HTML headings and working CTA. Fine pointer adds small camera displacement. Renderer stops when offscreen/hidden. Reduced-motion/no-WebGL uses a poster captured from the actual landscape.

Score: camera travel (opening), staggered image reveals (collection), photographic mask and route trace (destinations), lateral typography (manifesto), calm functional recommendations. No empty authored silence.

Fingerprint comparison: changes opening device, route navigation, initial sequence and alpine signature against the previous scenic journal. Existing working footer and role navigation retained. As a revision it does not claim four-axis novelty against every historical ancestor.

Dependencies: Three.js is lazy-loaded only for the immersive opening and owns rendering, lighting, geometry and GPU cleanup; React remains responsible for accessible controls. FFmpeg is absent but not required by this non-video pipeline. Existing Playwright provides verification.
