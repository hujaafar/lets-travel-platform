import { useEffect, useRef } from "react";
import { ArrowUpRight, MapPin, Waves, Mountain, Landmark } from "lucide-react";
import "./travelHero.css";
import "./expressiveMotion.css";

export default function TravelHero({
  onExplore,
}: {
  onExplore: (query: string) => void;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const stage = el.firstElementChild as HTMLElement;
      const mobile = window.innerWidth <= 760;
      const top = el.getBoundingClientRect().top;
      const offset = parseFloat(getComputedStyle(stage).top) || 0;
      const span = mobile
        ? el.offsetHeight
        : el.offsetHeight - stage.offsetHeight;
      const progress = Math.max(
        0,
        Math.min(1, (offset - top) / Math.max(1, span)),
      );
      el.style.setProperty("--journey", String(progress));
      el.dataset.progress = progress.toFixed(3);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const observer = new IntersectionObserver(([entry]) => {
      el.classList.toggle("in-view", entry.isIntersecting);
    });
    const visibility = () => el.classList.toggle("is-hidden", document.hidden);
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const bounds = el.getBoundingClientRect();
      el.style.setProperty(
        "--pointer-x",
        String(((event.clientX - bounds.left) / bounds.width) * 2 - 1),
      );
      el.style.setProperty(
        "--pointer-y",
        String((event.clientY / innerHeight) * 2 - 1),
      );
    };
    el.addEventListener("pointermove", pointer, { passive: true });
    observer.observe(el);
    paint();
    visibility();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("pointermove", pointer);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <section
      className="lt-voyage"
      ref={root}
      aria-label="Find your kind of travel"
    >
      <div className="lt-voyage-stage">
        <div className="lt-voyage-window" aria-hidden="true">
          <img src="/images/uluwatu.jpg" alt="" fetchPriority="high" />
          <span className="lt-voyage-location">
            <MapPin size={14} /> Uluwatu, Bali
          </span>
        </div>
        <div className="lt-voyage-shade" aria-hidden="true" />
        <div className="lt-voyage-copy">
          <p className="lt-eyebrow">GOOD PLACES. GREAT COMPANY.</p>
          <h1>
            Find your
            <br />
            kind of
            <br />
            <em>elsewhere.</em>
          </h1>
          <p className="lt-voyage-description">
            A slower morning. A different view.
            <br />A journey that feels like you.
          </p>
          <button
            className="lt-button lt-voyage-action"
            onClick={() => onExplore("")}
          >
            Explore journeys <ArrowUpRight size={20} />
          </button>
          <span className="lt-voyage-note">
            Thoughtful itineraries. Room to explore.
          </span>
        </div>
        <svg
          className="lt-voyage-route"
          viewBox="0 0 600 240"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M20 205C160 225 40 25 240 55S435 235 575 25"
            stroke="currentColor"
            strokeOpacity=".3"
            strokeDasharray="3 6"
          />
          <path
            className="lt-voyage-trace"
            d="M20 205C160 225 40 25 240 55S435 235 575 25"
            stroke="currentColor"
            pathLength="1"
          />
          <circle cx="575" cy="25" r="5" fill="currentColor" />
          <g className="lt-route-aircraft">
            <path
              d="M-13 -3L-2 -2 3 -12 7 -12 5 -2 13 0 5 2 7 12 3 12 -2 2 -13 3 -10 0Z"
              fill="currentColor"
            />
          </g>
        </svg>
        <button
          className="lt-postcard-satellite satellite-greece"
          onClick={() => onExplore("Greece")}
          aria-label="Discover journeys in Greece"
        >
          <img
            src="/images/greece.jpg"
            alt="Blue domes overlooking the Aegean"
          />
          <span>
            Salt air &amp; slow days
            <strong>
              Greece <ArrowUpRight size={15} />
            </strong>
          </span>
        </button>
        <button
          className="lt-postcard-satellite satellite-japan"
          onClick={() => onExplore("Japan")}
          aria-label="Discover journeys in Japan"
        >
          <img src="/images/japan.jpg" alt="An evening walk through Kyoto" />
          <span>
            A different rhythm
            <strong>
              Japan <ArrowUpRight size={15} />
            </strong>
          </span>
        </button>
        <button
          className="lt-postcard"
          onClick={() => onExplore("Bali")}
          aria-label="Discover journeys in Bali"
        >
          <img src="/images/bali.jpg" alt="Lakeside temple in Bali" />
          <span>
            <span>
              A little inspiration<strong>Bali, Indonesia</strong>
            </span>
            <ArrowUpRight size={20} />
          </span>
        </button>
      </div>
      <nav className="lt-travel-interests" aria-label="Explore by travel style">
        <span>
          What’s your
          <br />
          <strong>kind of escape?</strong>
        </span>
        {[
          { label: "Coast & calm", query: "Beach", icon: Waves },
          { label: "Culture & cities", query: "Culture", icon: Landmark },
          { label: "Into the wild", query: "Hiking", icon: Mountain },
        ].map(({ label, query, icon: Icon }) => (
          <button key={query} onClick={() => onExplore(query)}>
            <Icon size={23} strokeWidth={1.3} />
            <span>{label}</span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </nav>
    </section>
  );
}
