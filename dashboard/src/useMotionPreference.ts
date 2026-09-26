import { useState } from "react";

/** Every visit starts in motion; visitors can pause the current session. */
export function useMotionPreference() {
  const [enabled, setEnabled] = useState(true);
  return { enabled, toggle: () => setEnabled((value) => !value) };
}
