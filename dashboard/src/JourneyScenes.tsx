import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

type Scene = {
  id: string;
  title: string;
  image: string;
  stops: { destination: string; country: string }[];
};
export default function JourneyScenes<T extends Scene>({
  trips,
  onOpen,
}: {
  trips: T[];
  onOpen: (trip: T) => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const scenes = trips.slice(0, 3);
  const count = scenes.length;
  const sceneKey = scenes.map((trip) => trip.id).join(",");
  const current = Math.min(active, Math.max(0, count - 1));
  useEffect(() => {
    const el = root.current;
    if (!el || !window.matchMedia) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const photos = [...el.querySelectorAll<HTMLElement>(".lt-scene-photo")];
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (reduced.matches) return;
      const stage = el.firstElementChild as HTMLElement;
      const offset = parseFloat(getComputedStyle(stage).top) || 0;
      const span = el.offsetHeight - stage.offsetHeight;
      const p = Math.max(
        0,
        Math.min(
          1,
          (offset - el.getBoundingClientRect().top) / Math.max(1, span),
        ),
      );
      el.style.setProperty("--scene-progress", String(p));
      el.dataset.progress = p.toFixed(3);
      photos.forEach((photo, i) => {
        const reveal = Math.max(
          0,
          Math.min(1, p * Math.max(1, count - 1) - i + 1),
        );
        photo.style.setProperty(
          "--cover",
          `${i === 0 ? 0 : (1 - reveal) * 100}%`,
        );
        photo.style.setProperty("--photo-scale", String(1.12 - reveal * 0.12));
      });
      setActive(Math.min(count - 1, Math.round(p * Math.max(1, count - 1))));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, [count, sceneKey]);
  if (!count) return null;
  const choose = (index: number) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setActive(index);
      return;
    }
    const el = root.current;
    if (!el) return;
    const stage = el.firstElementChild as HTMLElement;
    const offset = parseFloat(getComputedStyle(stage).top) || 0;
    const span = el.offsetHeight - stage.offsetHeight;
    window.scrollTo({
      top:
        window.scrollY +
        el.getBoundingClientRect().top -
        offset +
        (span * index) / Math.max(1, count - 1),
      behavior: "smooth",
    });
  };
  return (
    <section className="lt-scenes" ref={root} aria-label="A change of scene">
      <div className="lt-scenes-stage">
        <div className="lt-scene-photographs" aria-hidden="true">
          {scenes.map((trip, i) => (
            <div
              key={trip.id}
              className={`lt-scene-photo ${current === i ? "is-active" : ""}`}
              style={
                { "--cover": i === 0 ? "0%" : "100%" } as React.CSSProperties
              }
            >
              <img src={`/images/${trip.image}.jpg`} alt="" loading="lazy" />
            </div>
          ))}
        </div>
        <div className="lt-scene-top">
          <span>TAKE THE SCENIC ROUTE</span>
          <a href="#personal">Find your kind of elsewhere ↗</a>
        </div>
        <div className="lt-scene-copy">
          <p>A change of scene.</p>
          <h2>
            {scenes[current].stops[0]?.destination || scenes[current].title}
            <span>{scenes[current].stops[0]?.country}</span>
          </h2>
          <button
            type="button"
            className="lt-button lt-button-light"
            onClick={() => onOpen(scenes[current])}
          >
            Explore this journey <ArrowUpRight size={18} />
          </button>
        </div>
        <svg
          className="lt-scene-route"
          viewBox="0 0 600 180"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M20 140 C130 140 120 25 250 70 S420 170 580 30"
            stroke="currentColor"
            strokeOpacity=".25"
            strokeWidth="1"
          />
          <path
            className="lt-route-trace"
            d="M20 140 C130 140 120 25 250 70 S420 170 580 30"
            pathLength="1"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="20" cy="140" r="5" fill="currentColor" />
          <circle cx="580" cy="30" r="5" fill="currentColor" />
        </svg>
        <div className="lt-scene-tabs" aria-label="Choose a destination">
          {scenes.map((trip, i) => (
            <button
              type="button"
              key={trip.id}
              aria-pressed={current === i}
              onClick={() => choose(i)}
            >
              <span>{trip.stops[0]?.destination || trip.title}</span>
              <span>{trip.stops[0]?.country}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
