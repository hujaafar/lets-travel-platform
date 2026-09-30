import { useEffect, type RefObject } from "react";
const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const desktopMotion = () => matchMedia("(min-width: 981px)").matches;

/** Bring a rail card into view for a button or keyboard focus, using native scrolling. */
export function scrollToJourney(
  scene: HTMLElement | null,
  index: number,
  instant = false,
) {
  const rail = scene?.querySelector<HTMLElement>("[data-rail]");
  const viewport = rail?.querySelector<HTMLElement>(".collection-window");
  const cards = rail?.querySelectorAll<HTMLElement>("[data-journey-card]");
  if (!rail || !viewport || !cards?.length) return;
  index = Math.round(clamp(index, 0, cards.length - 1));
  const behavior = instant ? "instant" : "smooth";
  if (desktopMotion()) {
    const distance =
      parseFloat(rail.style.getPropertyValue("--rail-distance")) || 0;
    window.scrollTo({
      top:
        rail.getBoundingClientRect().top +
        scrollY -
        22 +
        (distance * index) / Math.max(1, cards.length - 1),
      behavior,
    });
  } else {
    viewport.scrollTo({ left: cards[index].offsetLeft, behavior });
  }
}

/** One scheduled frame per input, no wheel interception or idle render loop. */
export function useScrollScene(
  root: RefObject<HTMLDivElement | null>,
  revision: string,
  onStop: (index: number) => void,
  onJourney: (index: number) => void,
) {
  useEffect(() => {
    const scene = root.current;
    if (!scene) return;
    const desktop = matchMedia("(min-width: 981px)");
    const fine = matchMedia("(pointer: fine)");
    const acts = [...scene.querySelectorAll<HTMLElement>("[data-sc-act]")];
    const stops = [...scene.querySelectorAll<HTMLElement>("[data-route-stop]")];
    const flight = scene.querySelector<HTMLElement>("[data-flight]");
    const launch = scene.querySelector<HTMLElement>(".launch-stage");
    const plane = scene.querySelector<SVGGElement>(".flight-plane");
    const ticker = scene.querySelector<HTMLElement>("[data-ticker]");
    const rail = scene.querySelector<HTMLElement>("[data-rail]");
    const stage = rail?.querySelector<HTMLElement>(".collection-stage");
    const viewport = rail?.querySelector<HTMLElement>(".collection-window");
    const cards = [
      ...scene.querySelectorAll<HTMLElement>("[data-journey-card]"),
    ];
    let frame = 0,
      selected = -1,
      gallerySelected = -1,
      distance = 0,
      needsMeasure = true;
    let pointer: { x: number; y: number } | null = null;
    const set = (
      el: HTMLElement | null | undefined,
      name: string,
      value: number,
    ) => el?.style.setProperty(name, value.toFixed(4));
    function paint() {
      frame = 0;
      if (!scene || document.hidden) return;
      const height = innerHeight,
        pinned = desktop.matches;
      if (needsMeasure && rail && stage && viewport) {
        const last = cards.at(-1);
        distance = Math.max(
          0,
          last
            ? last.offsetLeft + last.offsetWidth - viewport.clientWidth + 16
            : 0,
        );
        rail.style.setProperty(
          "--rail-distance",
          pinned ? distance + "px" : "0px",
        );
        needsMeasure = false;
      }
      set(
        scene,
        "--page-read",
        clamp(
          scrollY / Math.max(1, document.documentElement.scrollHeight - height),
        ),
      );
      for (const act of acts) {
        const box = act.getBoundingClientRect();
        if (box.bottom < -height || box.top > height * 2) continue;
        set(act, "--sc-p", clamp((height - box.top) / (height + box.height)));
      }
      if (flight && launch) {
        const box = flight.getBoundingClientRect();
        const progress = pinned
          ? clamp(
              (22 - box.top) / Math.max(1, box.height - launch.offsetHeight),
            )
          : clamp((height * 0.7 - box.top) / (box.height + height * 0.3));
        set(flight, "--flight", progress);
        if (plane) {
          const t = progress,
            u = 1 - t;
          const x =
            u * u * u * 90 +
            3 * u * u * t * 290 +
            3 * u * t * t * 710 +
            t * t * t * 1010;
          const y =
            u * u * u * 360 +
            3 * u * u * t * 20 +
            3 * u * t * t * 20 +
            t * t * t * 240;
          const dx = 3 * u * u * 200 + 6 * u * t * 420 + 3 * t * t * 300;
          const dy = 3 * u * u * -340 + 3 * t * t * 220;
          plane.setAttribute(
            "transform",
            `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI})`,
          );
        }
        const boxLaunch = launch.getBoundingClientRect();
        set(
          launch,
          "--pointer-x",
          pointer && pinned && fine.matches
            ? clamp(
                (pointer.x - boxLaunch.left) / boxLaunch.width - 0.5,
                -0.5,
                0.5,
              )
            : 0,
        );
        set(
          launch,
          "--pointer-y",
          pointer && pinned && fine.matches
            ? clamp(
                (pointer.y - boxLaunch.top) / boxLaunch.height - 0.5,
                -0.5,
                0.5,
              )
            : 0,
        );
      }
      if (ticker) {
        const box = ticker.getBoundingClientRect();
        set(
          ticker,
          "--ticker",
          clamp((height - box.top) / (height + box.height)),
        );
      }
      let current = 0;
      stops.forEach((stop, index) => {
        const box = stop.getBoundingClientRect();
        if (box.top < height * 0.52) current = index;
        set(stop, "--stop-entry", clamp((height - box.top) / (height * 0.8)));
      });
      if (current !== selected) {
        selected = current;
        onStop(current);
      }
      if (rail && viewport) {
        const progress = pinned
          ? clamp(
              (22 - rail.getBoundingClientRect().top) / Math.max(1, distance),
            )
          : clamp(
              viewport.scrollLeft /
                Math.max(1, viewport.scrollWidth - viewport.clientWidth),
            );
        if (pinned && viewport.scrollLeft !== 0) viewport.scrollLeft = 0;
        set(rail, "--rail-progress", progress);
        rail.style.setProperty(
          "--rail-x",
          pinned ? -progress * distance + "px" : "0px",
        );
        cards.forEach((card) => {
          const center =
            card.offsetLeft + card.offsetWidth / 2 - progress * distance;
          set(
            card,
            "--card-distance",
            pinned
              ? clamp(
                  (center - viewport.clientWidth / 2) / viewport.clientWidth,
                  -1,
                  1,
                )
              : 0,
          );
        });
        const index = Math.round(progress * Math.max(0, cards.length - 1));
        if (index !== gallerySelected) {
          gallerySelected = index;
          onJourney(index);
        }
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(paint);
    }
    function measure() {
      needsMeasure = true;
      schedule();
    }
    function move(event: PointerEvent) {
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    }
    function leave() {
      pointer = null;
      schedule();
    }
    function focus(event: FocusEvent) {
      const card = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-journey-card]",
      );
      if (card && desktopMotion()) {
        scrollToJourney(scene, Number(card.dataset.journeyCard), true);
        schedule();
      }
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    scene
      .querySelectorAll("[data-sc-in]")
      .forEach((el) => observer.observe(el));
    const resize = new ResizeObserver(measure);
    resize.observe(scene);
    if (viewport) resize.observe(viewport);
    scene.classList.add("motion-ready");
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", measure, { passive: true });
    viewport?.addEventListener("scroll", schedule, { passive: true });
    launch?.addEventListener("pointermove", move, { passive: true });
    launch?.addEventListener("pointerleave", leave);
    scene.addEventListener("focusin", focus);
    document.addEventListener("visibilitychange", measure);
    desktop.addEventListener("change", measure);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      removeEventListener("scroll", schedule);
      removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", schedule);
      launch?.removeEventListener("pointermove", move);
      launch?.removeEventListener("pointerleave", leave);
      scene.removeEventListener("focusin", focus);
      document.removeEventListener("visibilitychange", measure);
      desktop.removeEventListener("change", measure);
      scene.classList.remove("motion-ready");
    };
  }, [root, revision, onStop, onJourney]);
}
