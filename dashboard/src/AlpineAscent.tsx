import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import "./alpine.css";

const chapters = [
  {
    name: "The departure",
    title: (
      <>
        GO
        <br />
        BEYOND.
      </>
    ),
    copy: "Some places change your plans. Others change your perspective.",
  },
  {
    name: "The crossing",
    title: (
      <>
        FEEL
        <br />
        FURTHER.
      </>
    ),
    copy: "Follow the unfamiliar. The best stories begin beyond your everyday.",
  },
  {
    name: "The horizon",
    title: (
      <>
        FIND
        <br />
        YOUR WORLD.
      </>
    ),
    copy: "From quiet mountain trails to cities that never sleep. Your next chapter is out there.",
  },
];

export default function AlpineAscent() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [chapter, setChapter] = useState(0);
  const [paused, setPaused] = useState(false);
  const [staticScene, setStaticScene] = useState(false);
  const [allowMotion, setAllowMotion] = useState(() => {
    try {
      return localStorage.getItem("lt-ascent-motion") === "enabled";
    } catch {
      return false;
    }
  });
  const [unavailable, setUnavailable] = useState(false);
  const selectMotion = (enabled: boolean) => {
    setAllowMotion(enabled);
    try {
      localStorage.setItem("lt-ascent-motion", enabled ? "enabled" : "system");
    } catch {
      /* The control still works when browser storage is unavailable. */
    }
  };
  const wake = useRef<() => void>(() => {});
  useEffect(() => {
    wake.current();
  }, [paused]);
  const motion = useRef({ paused: false, progress: 0 });
  motion.current.paused = paused;
  useEffect(() => {
    const el = root.current;
    const surface = canvas.current;
    if (!el || !surface || !window.matchMedia) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const isReduced = () => reduced.matches && !allowMotion;
    setStaticScene(isReduced());
    setUnavailable(false);
    let world:
      ReturnType<typeof import("./ascentWorld").createAscentWorld> | undefined;
    let disposed = false,
      visible = true,
      frame = 0,
      previous = 0,
      time = 0,
      current = 0;
    let pointerX = 0,
      pointerY = 0;
    const update = () => {
      const stage = el.firstElementChild as HTMLElement;
      const offset = parseFloat(getComputedStyle(stage).top) || 0;
      motion.current.progress = Math.max(
        0,
        Math.min(
          1,
          (offset - el.getBoundingClientRect().top) /
            Math.max(1, el.offsetHeight - stage.offsetHeight),
        ),
      );
      el.dataset.progress = motion.current.progress.toFixed(3);
      el.style.setProperty("--ascent", String(motion.current.progress));
      if (!isReduced())
        setChapter(Math.min(2, Math.round(motion.current.progress * 2)));
      start();
    };
    const draw = (now: number) => {
      frame = 0;
      if (disposed || !world || !visible || document.hidden || isReduced())
        return;
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      current +=
        (motion.current.progress - current) * (1 - Math.exp(-delta * 8));
      if (!motion.current.paused) time += delta;
      world.render(current, time, pointerX, pointerY);
      el.dataset.renderer = "webgl";
      if (
        !motion.current.paused ||
        Math.abs(motion.current.progress - current) > 0.001
      )
        frame = requestAnimationFrame(draw);
    };
    const start = () => {
      if (!frame && world && visible && !document.hidden && !isReduced()) {
        previous = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };
    wake.current = start;
    const load = async () => {
      if (isReduced()) {
        setStaticScene(true);
        return;
      }
      try {
        const { createAscentWorld } = await import("./ascentWorld");
        if (disposed) return;
        world = createAscentWorld(surface);
        start();
      } catch {
        if (!disposed) {
          setStaticScene(true);
          setUnavailable(true);
          el.dataset.renderer = "poster";
        }
      }
    };
    const preference = () => {
      setStaticScene(isReduced());
      if (isReduced()) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (world) start();
      else void load();
    };
    const resize = () => {
      world?.resize();
      update();
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || motion.current.paused) return;
      pointerX = (event.clientX / innerWidth - 0.5) * 2;
      pointerY = (event.clientY / innerHeight - 0.5) * -2;
    };
    const lost = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      world?.dispose();
      world = undefined;
      setStaticScene(true);
      setUnavailable(true);
      el.dataset.renderer = "poster";
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    observer.observe(el);
    update();
    void load();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", resize);
    el.addEventListener("pointermove", pointer);
    surface.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", start);
    reduced.addEventListener("change", preference);
    return () => {
      disposed = true;
      wake.current = () => {};
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", resize);
      el.removeEventListener("pointermove", pointer);
      surface.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", start);
      reduced.removeEventListener("change", preference);
      world?.dispose();
    };
  }, [allowMotion]);
  const choose = (index: number) => {
    if (staticScene) {
      setChapter(index);
      return;
    }
    const el = root.current;
    if (!el) return;
    const stage = el.firstElementChild as HTMLElement;
    window.scrollTo({
      top:
        scrollY +
        el.getBoundingClientRect().top -
        (parseFloat(getComputedStyle(stage).top) || 0) +
        ((el.offsetHeight - stage.offsetHeight) * index) / 2,
      behavior: "smooth",
    });
  };
  return (
    <section
      ref={root}
      className={`lt-ascent ${staticScene ? "is-static" : ""} ${allowMotion ? "has-motion" : ""}`}
      aria-label="The alpine ascent"
      data-chapter={chapter}
    >
      <div className="lt-ascent-stage">
        <picture className="lt-ascent-poster" aria-hidden="true">
          <source
            media="(max-width: 700px)"
            srcSet="/images/ascent-mobile.jpg"
          />
          <img src="/images/ascent-poster.jpg" alt="" />
        </picture>
        <canvas ref={canvas} className="lt-ascent-canvas" aria-hidden="true" />
        <div className="lt-ascent-top">
          <span>AN ALPINE STATE OF MIND</span>
          <span>LET’S TRAVEL / THE GREAT OUTSIDE</span>
        </div>
        <div className="lt-ascent-copy" key={chapter}>
          <p className="lt-ascent-chapter">{chapters[chapter].name}</p>
          <h1>{chapters[chapter].title}</h1>
          <p className="lt-ascent-description">{chapters[chapter].copy}</p>
          <a href="#collection" className="lt-ascent-action">
            Find your next journey <ArrowUpRight size={20} />
          </a>
        </div>
        <nav className="lt-ascent-route" aria-label="Ascent chapters">
          <svg viewBox="0 0 70 300" aria-hidden="true">
            <path d="M12 280C65 215 0 160 55 20" />
            <path
              className="lt-ascent-trace"
              pathLength="1"
              d="M12 280C65 215 0 160 55 20"
            />
          </svg>
          {chapters.map((item, i) => (
            <button
              key={item.name}
              onClick={() => choose(i)}
              aria-pressed={chapter === i}
            >
              <span>{item.name.replace("The ", "")}</span>
              <i />
            </button>
          ))}
        </nav>
        <div className="lt-ascent-bottom">
          <span>OUT OF THE EVERYDAY. INTO THE EXTRAORDINARY.</span>
          <div className="lt-ascent-controls">
            {allowMotion && (
              <button onClick={() => selectMotion(false)}>
                Use system setting
              </button>
            )}
            <button
              onClick={() =>
                staticScene ? selectMotion(true) : setPaused(!paused)
              }
              aria-pressed={paused}
              disabled={unavailable}
            >
              {paused || staticScene ? <Play size={13} /> : <Pause size={13} />}
              {staticScene
                ? unavailable
                  ? "Still view"
                  : "Enable motion"
                : paused
                  ? "Resume atmosphere"
                  : "Pause atmosphere"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
