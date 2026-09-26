# Package and design decisions

| Choice | Why it is used |
|---|---|
| Java 17 / Spring Boot 3.5 | Familiar Java ecosystem, validated request DTOs, dependency management, operational health endpoints |
| Spring JDBC | Explicit SQL, visible cascade rules, small service footprint; avoids hidden ORM relationship behavior |
| Spring Security BCrypt | Mature password hashing implementation rather than custom cryptography |
| PostgreSQL | Transactions, numeric money types, constraints, cascade rules and shared session consistency |
| Neo4j Java driver | Explicit destination relationships projected transactionally |
| React + TypeScript + Vite | Typed reusable forms and responsive interaction, static production output |
| DM Sans + Fraunces | A readable operational face and an expressive editorial face for the itinerary spreads; both served locally |
| Lucide | Consistent, lightweight SVG icon vocabulary |
| Native HTML dialog | Focus trapping, Escape handling and browser semantics without a modal library |
| Playwright + axe | Actual Chrome/Firefox workflows, narrow viewport checks, explicit motion-policy checks and accessibility assertions |
| Vitest | Small, fast unit checks for formatting, search, CSV safety and date-only handling |
| Vitest V8 coverage | Uses the same pinned version as Vitest to produce LCOV for Sonar and a machine-readable summary. All TypeScript/TSX source is included, including untested files; only tests and type declarations are excluded. Browser E2E results remain separate from unit coverage. |
| Caddy | TLS termination, verified upstream TLS, static files, DNS discovery and round-robin balancing |
| Vault | Per-service AppRole policies and agent rendering rather than credentials baked into images |
| Jenkins / SonarQube / Ansible | Required build, quality-gate and repeatable deployment ecosystem |
| Loki / Grafana | Optional central view of structured service logs and request IDs |

The `.npmrc` enables legacy peer resolution because npm 10/11 otherwise traverses Vitest's optional browser peers into incompatible major-version cycles. This project uses Playwright directly for browsers and Vitest for Node-only units. The exact resolved dependencies are committed in the lockfile and audited; no TLS verification or vulnerability checking is disabled.

## Scroll Craft adaptation

The user explicitly requested [Scroll Craft](https://github.com/nateherkai/scroll-craft), then rejected the first restrained dashboard and delegated a stronger scroll-led redesign. The complete skill is installed locally. The earlier Kinetic Atlas expands the photograph into a pinned scene, draws a flight path, moves the foreground ticket independently, changes into a dark itinerary spread, then uses measured native scroll to move through a dimensional saved-journey gallery. A large orbital closing composition opens the actual planning form. These scenes remain in the current Unified Atlas, with the common product treatment described below. Each brief distinguishes supplied evidence from authored decisions.

The rejected fingerprint remains in the registry. The initial redesign differs in all six dimensions; its kinetic expansion differs in five. See `scrollcraft/builds/kinetic-atlas/BRIEF.md` and `REPORT.md`. The upstream engine is preserved unmodified for reference. A small React hook implements the relevant progress and reveal behavior with lifecycle cleanup and one queued animation frame, avoiding duplicate observers after navigation. It never intercepts wheel input. The gallery pin span equals its measured horizontal travel. Focus reveals the corresponding card immediately, while small screens use native horizontal scrolling. Earlier versions removed pinning for reduced motion; that policy was superseded by the user's explicit always-on request in Unified Atlas. No extra animation dependency was added. No generated media, paid API calls, scroll-scrubbed video or full video encoder is required for this photographic composition.

## Orbital departure

The user supplied https://arstraumur.music/ and asked for equivalent visual energy. The new introductory camera scene turns a NASA-textured Earth, moves star planes, traces a decorative orbit, and reveals the featured journey through an expanding photographic aperture. Unlike the previous desktop-only strongest effects, this opening operates at every width; mobile has a separate layout and shorter scroll span. Three chapter buttons and a keyboard-aware skip preserve direct access to the admin work.

An original, small WebGL shader renders the globe on demand. CSS supplies a photographic fallback if WebGL is unavailable or lost; no extra runtime dependency is required. The scene releases GPU objects and event handlers on unmount. This iteration originally defaulted to the OS preference with a persisted on/off control; Unified Atlas replaces that policy as described below. The fictional data and preview adapter remain documented, while the user-requested topbar badge is removed.

## Unified Atlas — current direction

The user asked for consistency between every page and the bottom of Home, and explicitly requested “MAKE MOTION ALWAYS ON”. The shared `dashboard/src/atlas.css` layer now carries the same ink canvas (`#080e14`), raised ink surface (`#0e1921`), warm ivory text (`#f4f0e6`) and copper accent (`#e7ab87`) through the orbital opening, the lower Home scenes, all five operational pages, native dialogs, help and login. Primary buttons use copper with dark text. Borders, controls, muted text, status colors and focus states share the same system. Destination photography supplies variation without switching the surrounding product palette.

Operational pages share one heading component: a section number, section label, contextual metadata, Fraunces title, supporting text, actions and a quiet orbit illustration. The fixed navigation frame, form controls, table rows, calendar, settings panels and footer use the same spacing and surface treatments. Short entry transitions carry the orbital visual language into navigation without delaying interaction. DM Sans remains the functional typeface; Fraunces remains the display typeface.

Motion is always enabled under the user's explicit direction. The scenes do not read the old stored motion-off choice, there is no on/off switch, and OS reduced-motion preference no longer disables the scenes. This is an intentional change from the skill's default reduced-motion guidance and from the previous release, not an accidental preference migration. The experience still responds to native scroll and pointer input rather than running an idle animation loop; direct chapters, skip-to-workspace, ordinary navigation, keyboard focus reveal and the mobile gallery remain available. Rendering stops while the globe is offscreen or the document is hidden, and listeners/GPU resources are released on unmount.

See `scrollcraft/builds/unified-atlas/BRIEF.md` and `REPORT.md`. This is a consistency revision of the existing Orbital departure composition; it does not claim a newly invented scene structure or four changed fingerprint dimensions. Current verification is recorded separately from historical results in `docs/VERIFICATION.md`.

## Photography and assets

Cover photographs are illustrative assets from Unsplash, downloaded and served locally. They are not booking listings or evidence of an included property. The sample itineraries are fictional teaching data. The brand mark is an original interlocking TP monogram, drawn as compact filled SVG paths on the vermilion tile. Its open counters remain readable at favicon and sidebar sizes. The same asset supplies the sidebar, login, loading screen and favicon. Both font families are distributed under the SIL Open Font License; copies are in `docs/licenses` and embedded in the standalone preview. Scroll Craft includes its upstream license.

| Local asset | Original image |
|---|---|
| Bali | https://images.unsplash.com/photo-1537996194471-e657df975ab4 |
| Japan | https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e |
| Mountains | https://images.unsplash.com/photo-1464822759023-fed622ff2c3b |
| Morocco | https://images.unsplash.com/photo-1539020140153-e479b8c22e70 |
| Greece | https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e |
| Iceland | https://images.unsplash.com/photo-1476610182048-b716b8518aae |
| Ubud route photograph | https://images.unsplash.com/photo-1555400038-63f5ba517a47 |
| Uluwatu route photograph | https://unsplash.com/photos/a-view-of-the-ocean-from-the-top-of-a-cliff-GA7rJUjzbJQ (Reynardo Etenia Wongso) |

See [Unsplash license](https://unsplash.com/license). Replace these local covers with project-owned photography if the product is publicly launched.

NASA Earth texture: see [credit and source](licenses/NASA-Blue-Marble.md).
