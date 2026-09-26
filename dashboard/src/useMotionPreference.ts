import { useEffect, useState } from "react";

type Preference = "system" | "enabled" | "paused";
export function useMotionPreference() {
  const [preference, setPreference] = useState<Preference>(() => {
    try {
      const saved = localStorage.getItem("lt-travel-motion");
      if (saved === "enabled" || saved === "paused") return saved;
      if (!saved && localStorage.getItem("lt-ascent-motion") === "enabled")
        return "enabled";
    } catch {
      // Motion controls still work when storage is unavailable.
    }
    return "system";
  });
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const select = (value: Preference) => {
    setPreference(value);
    try {
      localStorage.setItem("lt-travel-motion", value);
    } catch {
      // A blocked localStorage must not disable the current session's control.
    }
  };
  return {
    enabled: preference !== "paused" && (!reduced || preference === "enabled"),
    useSystem: () => select("system"),
    toggle: () =>
      select(
        preference !== "paused" && (!reduced || preference === "enabled")
          ? "paused"
          : "enabled",
      ),
    overridden: preference === "enabled" && reduced,
  };
}
