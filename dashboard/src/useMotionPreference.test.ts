// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMotionPreference } from "./useMotionPreference";

let reduced = false;
let update: () => void;
beforeEach(() => {
  localStorage.clear();
  reduced = false;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, listener: () => void) => {
      update = listener;
    },
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("visitor motion preference", () => {
  it("follows a changed system preference until the visitor explicitly enables motion", () => {
    const { result } = renderHook(useMotionPreference);
    expect(result.current.enabled).toBe(true);
    act(() => {
      reduced = true;
      update();
    });
    expect(result.current.enabled).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    expect(result.current.overridden).toBe(true);
    act(() => result.current.useSystem());
    expect(result.current.enabled).toBe(false);
  });
  it("persists a pause across remounts", () => {
    const first = renderHook(useMotionPreference);
    act(() => first.result.current.toggle());
    expect(first.result.current.enabled).toBe(false);
    first.unmount();
    const second = renderHook(useMotionPreference);
    expect(second.result.current.enabled).toBe(false);
    act(() => second.result.current.toggle());
    expect(second.result.current.enabled).toBe(true);
  });
  it("keeps the previous explicit motion opt-in during the design migration", () => {
    reduced = true;
    localStorage.setItem("lt-ascent-motion", "enabled");
    const { result } = renderHook(useMotionPreference);
    expect(result.current.enabled).toBe(true);
    act(() => result.current.useSystem());
    expect(result.current.enabled).toBe(false);
  });
  it("keeps the controls functional when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(useMotionPreference);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
  });
});
