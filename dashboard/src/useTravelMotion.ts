import { useEffect, type RefObject } from "react";

/** Native scroll, one requested frame per input, no scroll interception. */
export function useTravelMotion(
  root: RefObject<HTMLElement | null>,
  revision: string,
  enabled: boolean,
) {
  useEffect(() => {
    const el = root.current;
    if (!el || !window.matchMedia) return;
    let frame = 0;
    const targets = [
      ...el.querySelectorAll<HTMLElement>(
        ".lt-reveal, .lt-card, .lt-page-title, .lt-stat, .lt-table-trip, .lt-rank, .lt-section-heading, .lt-manifesto h2",
      ),
    ];
    targets.forEach((node, i) => {
      node.classList.add("lt-motion-item");
      node.style.setProperty("--entry-delay", `${(i % 3) * 70}ms`);
    });
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting)
            entry.target.classList.add("lt-in-view", "lt-visible");
        }),
      { threshold: 0.06 },
    );
    targets.forEach((node) => {
      if (!enabled) node.classList.add("lt-in-view", "lt-visible");
      else observer.observe(node);
    });
    const manifesto = el.querySelector<HTMLElement>(".lt-manifesto");
    const paint = () => {
      frame = 0;
      const scroll = window.scrollY;
      const length = Math.max(
        1,
        document.documentElement.scrollHeight - innerHeight,
      );
      el.style.setProperty(
        "--page-progress",
        String(Math.min(1, scroll / length)),
      );
      if (manifesto) {
        const p = Math.max(
          0,
          Math.min(
            1,
            (innerHeight - manifesto.getBoundingClientRect().top) /
              (innerHeight + manifesto.offsetHeight),
          ),
        );
        manifesto.style.setProperty(
          "--manifesto-progress",
          String(enabled ? p : 0.5),
        );
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [root, revision, enabled]);
}
