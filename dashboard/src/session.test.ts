import { describe, expect, it } from "vitest";
import { reconcileSessionUser, type User } from "./types";

const session: User = {
  id: "active-admin",
  name: "Original name",
  email: "original@example.test",
  role: "ADMIN",
  status: "ACTIVE",
  created_at: "2026-09-13",
  csrf: "current-session-token",
};

describe("active account refresh", () => {
  it("reflects a saved own-account edit while preserving the authenticated session", () => {
    const profile = {
      ...session,
      name: "Updated name",
      email: "updated@example.test",
      csrf: undefined,
    };
    expect(reconcileSessionUser(session, [profile])).toEqual({
      ...session,
      name: "Updated name",
      email: "updated@example.test",
    });
    expect(session.name).toBe("Original name");
  });

  it("updates role-dependent controls from the refreshed active profile", () => {
    const profile: User = { ...session, role: "TRAVEL_MANAGER" };
    expect(reconcileSessionUser(session, [profile])?.role).toBe(
      "TRAVEL_MANAGER",
    );
  });

  it("retains state identity when unrelated accounts or unchanged details refresh", () => {
    expect(
      reconcileSessionUser(session, [{ ...session, id: "another-admin" }]),
    ).toBe(session);
    expect(
      reconcileSessionUser(session, [{ ...session, csrf: undefined }]),
    ).toBe(session);
  });

  it("cannot restore a signed-out session from a late account-list response", () => {
    expect(reconcileSessionUser(null, [session])).toBeNull();
  });
});
