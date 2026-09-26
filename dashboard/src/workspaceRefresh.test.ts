import { describe, expect, it, vi } from "vitest";
import { refreshWorkspace } from "./workspaceRefresh";
import type { Gateway, Travel, User } from "./types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const travel = { id: "available-trip" } as Travel;
const user = { id: "available-user" } as User;
const gateway = { id: "configured-provider" } as Gateway;
const receivers = () => ({
  travels: vi.fn(),
  users: vi.fn(),
  gateways: vi.fn(),
});

describe("independent workspace service refresh", () => {
  it("publishes healthy service data without waiting for a slow payment service", async () => {
    const payment = deferred<Gateway[]>();
    const apply = receivers();
    const pending = refreshWorkspace(
      {
        travels: async () => [travel],
        users: async () => [user],
        gateways: () => payment.promise,
      },
      apply,
      () => true,
    );
    await vi.waitFor(() => {
      expect(apply.travels).toHaveBeenCalledWith([travel]);
      expect(apply.users).toHaveBeenCalledWith([user]);
    });
    expect(apply.gateways).not.toHaveBeenCalled();
    payment.resolve([gateway]);
    expect(await pending).toEqual([]);
    expect(apply.gateways).toHaveBeenCalledWith([gateway]);
  });
  it("preserves cached failed-service data while publishing the available peers and naming the failure", async () => {
    const cache = {
      travels: [] as Travel[],
      users: [] as User[],
      gateways: [gateway],
    };
    const errors = await refreshWorkspace(
      {
        travels: async () => [travel],
        users: async () => [user],
        gateways: async () => {
          throw new Error("Temporarily unavailable");
        },
      },
      {
        travels: (data) => {
          cache.travels = data;
        },
        users: (data) => {
          cache.users = data;
        },
        gateways: (data) => {
          cache.gateways = data;
        },
      },
      () => true,
    );
    expect(cache).toEqual({
      travels: [travel],
      users: [user],
      gateways: [gateway],
    });
    expect(errors).toEqual(["Payments: Temporarily unavailable"]);
  });
  it("reports multiple failures independently and still publishes a healthy payment service", async () => {
    const apply = receivers();
    const errors = await refreshWorkspace(
      {
        travels: async () => {
          throw new Error("Travel unavailable");
        },
        users: async () => {
          throw new Error("People unavailable");
        },
        gateways: async () => [gateway],
      },
      apply,
      () => true,
    );
    expect(errors).toEqual([
      "Travel plans: Travel unavailable",
      "People: People unavailable",
    ]);
    expect(apply.gateways).toHaveBeenCalledWith([gateway]);
    expect(apply.travels).not.toHaveBeenCalled();
    expect(apply.users).not.toHaveBeenCalled();
  });
  it("discards every response after session expiry so cleared caches cannot refill", async () => {
    let current = true;
    const requests = {
      travels: deferred<Travel[]>(),
      users: deferred<User[]>(),
      gateways: deferred<Gateway[]>(),
    };
    const apply = receivers();
    const pending = refreshWorkspace(
      {
        travels: () => requests.travels.promise,
        users: () => requests.users.promise,
        gateways: () => requests.gateways.promise,
      },
      apply,
      () => current,
    );
    current = false;
    requests.travels.resolve([travel]);
    requests.users.resolve([user]);
    requests.gateways.reject(new Error("Old session error"));
    expect(await pending).toEqual([]);
    for (const receiver of Object.values(apply))
      expect(receiver).not.toHaveBeenCalled();
  });
  it("keeps the newest refresh when an older request finishes later", async () => {
    let latest = 1;
    const old = deferred<Travel[]>();
    const apply = receivers();
    const previous = refreshWorkspace(
      {
        travels: () => old.promise,
        users: async () => [],
        gateways: async () => [],
      },
      apply,
      () => latest === 1,
    );
    latest = 2;
    await refreshWorkspace(
      {
        travels: async () => [travel],
        users: async () => [],
        gateways: async () => [],
      },
      apply,
      () => latest === 2,
    );
    old.resolve([{ id: "stale-trip" } as Travel]);
    await previous;
    expect(apply.travels).toHaveBeenCalledTimes(1);
    expect(apply.travels).toHaveBeenLastCalledWith([travel]);
  });
});
