import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, MoveUpRight, Orbit } from "lucide-react";
import { photo, type Travel } from "./types";
import { createOrbitGlobe } from "./orbitGlobe";

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const phases = [0, 0.44, 0.88];
const stars = Array.from({ length: 72 }, (_, i) => ({
  left: `${(i * 67.31 + 7) % 100}%`,
  top: `${(i * 31.77 + 3) % 100}%`,
  width: i % 11 === 0 ? 3 : 1.5,
  height: i % 11 === 0 ? 3 : 1.5,
  opacity: 0.18 + (i % 5) * 0.13,
}));

export default function OrbitIntro({
  travel,
  onOpen,
}: {
  travel?: Travel;
  onOpen: (travel: Travel) => void;
}) {
  const root = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [chapter, setChapter] = useState(0);
  const [rendered, setRendered] = useState(false);
  const country = travel?.stops[0]?.country || "somewhere new";

  useEffect(() => {
    const el = root.current,
      surface = canvas.current;
    if (!el || !surface) return;
    const stage = el.querySelector<HTMLElement>(".orbit-stage")!;
    let frame = 0,
      selected = -1,
      pointerX = 0,
      pointerY = 0;
    let globe: ReturnType<typeof createOrbitGlobe> = null;
    function paint() {
      frame = 0;
      if (document.hidden || !el) return;
      const box = el.getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight) return;
      const p = clamp(
        -box.top / Math.max(1, el.offsetHeight - stage.offsetHeight),
      );
      const next = p < 0.3 ? 0 : p < 0.67 ? 1 : 2;
      if (next !== selected) {
        selected = next;
        setChapter(next);
      }
      const zoom = 1 + clamp((p - 0.46) / 0.32) * 1.5;
      const fade = 1 - clamp((p - 0.62) / 0.16);
      const arrival = clamp((p - 0.59) / 0.37);
      const values: Record<string, number> = {
        "--orbit-p": p,
        "--earth-scale": zoom,
        "--earth-x": -clamp(p / 0.46) * 13,
        "--earth-y": clamp((p - 0.34) / 0.4) * 32,
        "--earth-opacity": fade,
        "--arrival": arrival,
        "--arrival-radius": arrival * 115,
        "--intro-opacity": 1 - clamp((p - 0.13) / 0.13),
        "--route-opacity":
          clamp((p - 0.27) / 0.09) * (1 - clamp((p - 0.57) / 0.08)),
        "--arrival-opacity": clamp((p - 0.72) / 0.12),
        "--pointer-x": pointerX,
        "--pointer-y": pointerY,
      };
      for (const [key, value] of Object.entries(values))
        el.style.setProperty(key, value.toFixed(4));
      const rotation = 0.42 + p * 2.65 + pointerX * 0.12;
      const t = clamp(p / 0.65),
        u = 1 - t;
      const craft = el.querySelector(".orbital-craft");
      craft?.setAttribute(
        "transform",
        `translate(${u * u * u * 74 + 3 * u * u * t * 30 + 3 * u * t * t * 570 + t * t * t * 895} ${u * u * u * 700 + 3 * u * u * t * 520 + 3 * u * t * t * 130 + t * t * t * 302})`,
      );
      if (globe?.draw(rotation)) setRendered(true);
      stage.dataset.scVerifyState = [
        rotation.toFixed(2),
        zoom.toFixed(2),
        fade.toFixed(2),
        arrival.toFixed(2),
      ].join(":");
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(paint);
    }
    function move(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      const box = stage.getBoundingClientRect();
      pointerX = (event.clientX - box.left) / box.width - 0.5;
      pointerY = (event.clientY - box.top) / box.height - 0.5;
      schedule();
    }
    function leave() {
      pointerX = pointerY = 0;
      schedule();
    }
    function contextLost(event: Event) {
      event.preventDefault();
      setRendered(false);
    }
    function restored() {
      globe?.dispose();
      globe = createOrbitGlobe(surface!, photo("earth"), schedule);
      schedule();
    }
    globe = createOrbitGlobe(surface, photo("earth"), schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(stage);
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    stage.addEventListener("pointermove", move, { passive: true });
    stage.addEventListener("pointerleave", leave);
    surface.addEventListener("webglcontextlost", contextLost);
    surface.addEventListener("webglcontextrestored", restored);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
      surface.removeEventListener("webglcontextlost", contextLost);
      surface.removeEventListener("webglcontextrestored", restored);
      globe?.dispose();
    };
  }, []);

  function goTo(index: number) {
    const el = root.current;
    if (!el) return;
    const height = el.querySelector<HTMLElement>(".orbit-stage")!.offsetHeight;
    window.scrollTo({
      top:
        el.getBoundingClientRect().top +
        scrollY +
        phases[index] * (el.offsetHeight - height),
      behavior: "smooth",
    });
  }
  function skip() {
    const heading =
      root.current?.parentElement?.querySelector<HTMLElement>("#desk-title");
    heading?.scrollIntoView({ behavior: "instant", block: "start" });
    heading?.focus({ preventScroll: true });
  }
  return (
    <section
      ref={root}
      className="orbital-intro orbit-motion"
      aria-label="An orbital departure"
    >
      <div className="orbit-stage" data-sc-verify-state="initial">
        <div className="orbit-stars far" aria-hidden="true">
          {stars.map((s, i) => (
            <i key={i} style={s} />
          ))}
        </div>
        <div className="orbit-stars near" aria-hidden="true">
          {stars
            .filter((_, i) => i % 3 === 0)
            .map((s, i) => (
              <i key={i} style={s} />
            ))}
        </div>
        <div className="orbit-meridian" aria-hidden="true" />
        <div className="orbit-earth" aria-hidden="true">
          <div
            className={`earth-fallback ${rendered ? "is-rendered" : ""}`}
            style={{ backgroundImage: `url(${photo("earth")})` }}
          />
          <canvas ref={canvas} className={rendered ? "is-rendered" : ""} />
          <svg className="earth-orbit" viewBox="0 0 1000 1000">
            <ellipse
              cx="500"
              cy="500"
              rx="480"
              ry="177"
              transform="rotate(-27 500 500)"
            />
            <path
              className="orbital-path"
              pathLength="1"
              d="M74 700 C30 520 570 130 895 302"
            />
            <g className="orbital-craft">
              <circle r="9" fill="currentColor" />
              <circle r="20" opacity=".35" />
            </g>
          </svg>
        </div>
        <div className="orbit-arrival" aria-hidden="true">
          <img src={photo(travel?.image || "bali")} alt="" />
        </div>
        <div className="orbit-topline">
          <span>
            <Orbit size={15} /> TRAVEL PLAN / ATLAS
          </span>
          <div>
            <button onClick={skip}>
              Skip to workspace <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
        <div className="orbit-intro-copy" aria-hidden={chapter !== 0}>
          <span className="orbit-eyebrow">A DIFFERENT POINT OF VIEW</span>
          <h2>
            A world
            <br />
            worth <em>going for.</em>
          </h2>
          <p>
            Extraordinary places.
            <br />
            Every detail, brought together.
          </p>
        </div>
        <div className="orbit-route-copy" aria-hidden={chapter !== 1}>
          <span className="orbit-eyebrow">
            THE DISTANCE BETWEEN DREAMING & GOING
          </span>
          <h2>
            Closer than
            <br />
            you <em>think.</em>
          </h2>
          <p>Your next chapter starts in {country}.</p>
        </div>
        <div
          className="orbit-arrival-copy"
          aria-hidden={chapter !== 2}
          inert={chapter !== 2}
        >
          <span className="orbit-eyebrow">WELCOME TO YOUR NEXT CHAPTER</span>
          <h2>
            {country}
            <em> awaits.</em>
          </h2>
          {travel && (
            <button onClick={() => onOpen(travel)}>
              Explore {travel.title}
              <MoveUpRight size={20} />
            </button>
          )}
        </div>
        <div className="orbit-bottomline">
          <div className="orbit-scroll-cue">
            <ArrowDown size={20} />
            <span>
              SCROLL TO TRAVEL
              <small>From orbit to arrival</small>
            </span>
          </div>
          <nav className="orbit-chapters" aria-label="Orbital chapters">
            {["The world", "The route", "The arrival"].map((name, i) => (
              <button
                key={name}
                onClick={() => goTo(i)}
                aria-current={chapter === i ? "step" : undefined}
              >
                <span>0{i + 1}</span>
                {name}
              </button>
            ))}
          </nav>
          <span className="orbit-coordinate" aria-hidden="true">
            EARTH / EVERY POSSIBILITY
          </span>
        </div>
        <div className="orbit-timeline" aria-hidden="true">
          <i />
        </div>
      </div>
    </section>
  );
}
