import { useEffect, type RefObject } from "react";

/** Native scroll, one requested frame per input, no scroll interception. */
export function useTravelMotion(
  root: RefObject<HTMLElement | null>,
  revision: string,
) {
  useEffect(() => {
    const el = root.current;
    if (!el || !window.matchMedia) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
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
    targets.forEach((node) => observer.observe(node));
    const hero = el.querySelector<HTMLElement>(".lt-hero");
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
      el.style.setProperty(
        "--hero-travel",
        String(
          reduced.matches
            ? 0
            : Math.min(
                1,
                scroll / Math.max(1, hero?.offsetHeight || innerHeight),
              ),
        ),
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
          String(reduced.matches ? 0.5 : p),
        );
      }
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
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, [root, revision]);
}
