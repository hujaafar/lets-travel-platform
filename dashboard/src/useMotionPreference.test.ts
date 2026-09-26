// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMotionPreference } from "./useMotionPreference";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
it("starts enabled even when a previous visit was paused", () => {
  localStorage.setItem("lt-travel-motion", "paused");
  expect(renderHook(useMotionPreference).result.current.enabled).toBe(true);
});
it("lets the visitor pause and resume the current visit", () => {
  const { result } = renderHook(useMotionPreference);
  act(() => result.current.toggle());
  expect(result.current.enabled).toBe(false);
  act(() => result.current.toggle());
  expect(result.current.enabled).toBe(true);
});
it("starts the next visit in motion", () => {
  const first = renderHook(useMotionPreference);
  act(() => first.result.current.toggle());
  first.unmount();
  expect(renderHook(useMotionPreference).result.current.enabled).toBe(true);
});
it("works without browser storage", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("blocked");
  });
  const { result } = renderHook(useMotionPreference);
  act(() => result.current.toggle());
  expect(result.current.enabled).toBe(false);
});
