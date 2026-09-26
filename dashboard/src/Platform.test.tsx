// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Platform, { checkoutUrl } from "./Platform";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn(), setCsrf: vi.fn() }));
const request = vi.mocked(api);
const traveler = {
  id: "u1",
  name: "Alex Traveler",
  email: "a@example.test",
  role: "TRAVELER",
  csrf: "token",
};
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn();
  request.mockImplementation(async (path) => {
    if (path === "/auth/me") return traveler;
    if (path === "/profile")
      return {
        past_trips: 2,
        cancellations: 1,
        reports: 0,
        payment_methods: [],
      };
    if (path === "/explore/recommendations")
      return { basis: "Discover", trips: [] };
    if (path === "/manage/analytics")
      return { monthly: [], trips: [], managers: [] };
    return [];
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe("hosted checkout links", () => {
  it.each([
    "https://evil.example",
    "javascript:alert(1)",
    "https://checkout.stripe.com.evil.test",
    "http://www.sandbox.paypal.com",
    "//checkout.stripe.com",
  ])("rejects %s", (url) => expect(checkoutUrl(url)).toBeNull());
  it.each([
    "https://checkout.stripe.com/c/pay/cs_test_123",
    "https://www.sandbox.paypal.com/checkoutnow?token=123",
  ])("accepts sandbox hosted payment URLs", (url) =>
    expect(checkoutUrl(url)).toBe(url),
  );
});
it("travelers see their own workspace without manager or admin tools", async () => {
  render(<Platform />);
  await screen.findByRole("button", { name: "My journeys" });
  expect(screen.queryByRole("button", { name: "Manager studio" })).toBeNull();
  expect(screen.queryByRole("link", { name: /Administration/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "My journeys" }));
  expect(await screen.findByText("Your next story is waiting.")).toBeTruthy();
});
it("shows personal statistics from the API", async () => {
  render(<Platform />);
  fireEvent.click(await screen.findByRole("button", { name: "My space" }));
  await screen.findByText("Past journeys");
  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.getByText("No payment history yet.")).toBeTruthy();
});
it("manager tools appear for manager accounts", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(async (path, ...args) =>
    path === "/auth/me"
      ? { ...traveler, role: "TRAVEL_MANAGER" }
      : original(path, ...args),
  );
  render(<Platform />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Manager studio" }),
  );
  expect(
    await screen.findByRole("button", { name: /Create a journey/ }),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Administration/ })).toBeNull();
});
it("registration never submits a privileged role", async () => {
  const original = request.getMockImplementation()!;
  request.mockImplementation(async (path, ...args) => {
    if (path === "/auth/me") throw new Error("Sign in");
    if (path === "/auth/login") return traveler;
    return original(path, ...args);
  });
  render(<Platform />);
  fireEvent.click(await screen.findByRole("button", { name: /New here/ }));
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "Alex" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "a@example.test" },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: "LongPassword123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith("/auth/register", "POST", {
      name: "Alex",
      email: "a@example.test",
      password: "LongPassword123!",
    }),
  );
});
