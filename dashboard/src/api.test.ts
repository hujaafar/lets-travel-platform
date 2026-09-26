import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, setCsrf } from "./api";

const dispatchEvent = vi.fn();
const unauthorized = () =>
  new Response(JSON.stringify({ message: "Please sign in again" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  dispatchEvent.mockClear();
  vi.stubGlobal("window", { dispatchEvent });
  setCsrf("old-session-token");
});

afterEach(() => {
  setCsrf("");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("session expiration responses", () => {
  it("does not expire a new session when an old pending request returns 401", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const pending = api("/travels");
    const rejection = expect(pending).rejects.toThrow("Please sign in again");
    expect(fetch).toHaveBeenCalledWith(
      "/api/travels",
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({
          "X-CSRF-Token": "old-session-token",
        }),
      }),
    );
    setCsrf("new-session-token");
    finish(unauthorized());
    await rejection;
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("expires the current session when its own authenticated request returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthorized()));
    await expect(api("/travels")).rejects.toThrow("Please sign in again");
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "session-expired" }),
    );
  });

  it("keeps rejected sign-in credentials as a form error without expiring another session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthorized()));
    await expect(
      api("/auth/login", "POST", { password: "wrong" }),
    ).rejects.toThrow("Please sign in again");
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});

describe("API requests and recoverable failures", () => {
  it("serializes edit payloads with false/zero values and sends the current CSRF token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      api("/payments/example", "PUT", { enabled: false, value: 0 }),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "/api/payments/example",
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
        body: '{"enabled":false,"value":0}',
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "old-session-token",
        },
      }),
    );
  });
  it.each([403, 409, 503])(
    "preserves a %s server validation/authorization error without signing out",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ message: "Refresh before saving" }), {
            status,
          }),
        ),
      );
      await expect(api("/travels/example", "PUT", {})).rejects.toThrow(
        "Refresh before saving",
      );
      expect(dispatchEvent).not.toHaveBeenCalled();
    },
  );
  it("reports a proxy HTML failure without exposing its document as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<h1>Bad gateway</h1>", { status: 502 }),
        ),
    );
    await expect(api("/travels")).rejects.toThrow(
      "The service is temporarily unavailable. Please try again.",
    );
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it("handles a JSON error without a message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("null", { status: 500 })),
    );
    await expect(api("/users")).rejects.toThrow("Request failed");
  });
  it("propagates a network outage to the service-specific refresh handler", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network unavailable")),
    );
    await expect(api("/payments")).rejects.toThrow("Network unavailable");
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("bounded API requests", () => {
  const timeoutMessage =
    "The service took too long to respond. Please try again.";

  function waitForAbort(signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Request aborted", "AbortError")),
        { once: true },
      );
    });
  }

  it("aborts a stalled connection after 15 seconds without expiring the session", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal!;
        return waitForAbort(signal);
      }),
    );
    const pending = api("/travels");
    const rejection = expect(pending).rejects.toThrow(timeoutMessage);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(signal.aborted).toBe(true);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 401])(
    "also bounds a stalled %s response body without interpreting it as a session failure",
    async (status) => {
      vi.useFakeTimers();
      const readBody = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, options: RequestInit) => {
          readBody.mockImplementation(() => waitForAbort(options.signal!));
          return Promise.resolve({
            ok: status === 200,
            status,
            text: readBody,
            json: readBody,
          });
        }),
      );
      const pending = api("/users");
      const rejection = expect(pending).rejects.toThrow(timeoutMessage);
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(readBody).toHaveBeenCalledOnce();
      expect(dispatchEvent).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("clears the deadline only after a successful body has been read", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    let complete!: (body: string) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal!;
        return Promise.resolve({
          ok: true,
          text: () =>
            new Promise<string>((resolve) => {
              complete = resolve;
            }),
        });
      }),
    );
    const pending = api("/payments");
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(1);
    complete("[]");
    await expect(pending).resolves.toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(signal.aborted).toBe(false);
  });
});
