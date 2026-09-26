// @vitest-environment jsdom
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "./App";
import { api, setCsrf } from "./api";
import type { User, Travel, Gateway } from "./types";

vi.mock("./api", () => ({ api: vi.fn(), setCsrf: vi.fn() }));
// WebGL/scroll scenes have separate real-browser coverage. Keep this suite
// focused on the real workspace, forms and session state, mocking only I/O.
vi.mock("./Overview", () => ({ default: () => <h1>Workspace overview</h1> }));

const admin: User = {
  id: "admin",
  name: "Admin",
  email: "admin@example.test",
  role: "ADMIN",
  status: "ACTIVE",
  created_at: "2026-01-01",
  csrf: "csrf",
};
const person: User = {
  ...admin,
  id: "person",
  name: "Traveller",
  email: "person@example.test",
  role: "VIEWER",
};
const trip: Travel = {
  id: "trip",
  title: "Japan journey",
  start_date: "2027-01-10",
  end_date: "2027-01-12",
  duration: 3,
  status: "DRAFT",
  price: 500,
  capacity: 4,
  description: "A trip",
  image: "japan",
  stops: [
    {
      destination: "Kyoto",
      country: "Japan",
      activities: "Walking",
      accommodation: "Hotel",
      transportation: "Train",
    },
  ],
  participantIds: [person.id],
  version: 2,
};
const gateway: Gateway = {
  id: "gateway",
  name: "Test Stripe",
  provider: "STRIPE",
  currency: "USD",
  enabled: false,
  configured: false,
  mode: "SANDBOX",
};
let session: User | null;
let users: User[];
let travels: Travel[];
let gateways: Gateway[];

beforeEach(() => {
  vi.resetAllMocks();
  session = { ...admin };
  users = [{ ...admin }, { ...person }];
  travels = [structuredClone(trip)];
  gateways = [{ ...gateway }];
  window.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.mocked(api).mockImplementation(async (path, method = "GET", body) => {
    if (path === "/auth/me" || path === "/auth/login") {
      if (!session) throw new Error("Please sign in");
      return session;
    }
    if (path === "/auth/logout") {
      session = null;
      return undefined;
    }
    if (method === "GET")
      return path === "/users"
        ? users
        : path === "/travels"
          ? travels
          : gateways;
    if (method === "DELETE") {
      users = users.filter((u) => path !== "/users/" + u.id);
      travels = travels.filter((t) => path !== "/travels/" + t.id);
      gateways = gateways.filter((g) => path !== "/payments/" + g.id);
    }
    if (path.endsWith("/test"))
      throw new Error("Sandbox credentials are not configured");
    return body;
  });
});
afterEach(() => cleanup());

async function workspace(page: string) {
  render(<App />);
  await screen.findByRole("heading", { name: "Workspace overview" });
  await waitFor(() => expect(api).toHaveBeenCalledWith("/payments"));
  fireEvent.click(screen.getByRole("button", { name: page }));
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
function submitDialog() {
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
}

test.each(["VIEWER", "TRAVEL_MANAGER"] as const)(
  "denies %s login and never requests business records",
  async (role) => {
    session = null;
    render(<App />);
    await screen.findByRole("button", { name: "Sign in" });
    session = { ...person, role };
    change("Password", "LongTestPassword!42");
    fireEvent.submit(document.querySelector(".login-form form")!);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Administrator access is required",
    );
    expect(screen.queryByRole("navigation", { name: "Workspace" })).toBeNull();
    for (const path of ["/users", "/travels", "/payments"])
      expect(api).not.toHaveBeenCalledWith(path);
  },
);

test("rejects an existing non-admin session before loading workspace data", async () => {
  session = { ...person };
  render(<App />);
  await screen.findByRole("button", { name: "Sign in" });
  expect(api).toHaveBeenCalledTimes(1);
  expect(setCsrf).not.toHaveBeenCalled();
});

test("creates a person with normalized values and refreshes after saving", async () => {
  await workspace("People");
  fireEvent.click(screen.getByRole("button", { name: "Add person" }));
  change("Full name", " New Person ");
  change("Email address", "NEW@example.test");
  change("Password", "LongTestPassword!42");
  submitDialog();
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/users",
      "POST",
      expect.objectContaining({
        name: "New Person",
        email: "new@example.test",
        role: "VIEWER",
        password: "LongTestPassword!42",
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("status").textContent).toContain("Changes saved");
});

test("edits a person's role and status without accidentally resetting the password", async () => {
  await workspace("People");
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit Traveller" }),
  );
  change("Role", "TRAVEL_MANAGER");
  change("Status", "SUSPENDED");
  submitDialog();
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/users/person", "PUT", {
      name: "Traveller",
      email: "person@example.test",
      role: "TRAVEL_MANAGER",
      status: "SUSPENDED",
    }),
  );
});

test.each([
  ["People", "Traveller", "/users/person"],
  ["Travel plans", "Japan journey", "/travels/trip"],
  ["Payments", "Test Stripe", "/payments/gateway"],
])(
  "requires confirmation before deleting a record on %s",
  async (page, name, endpoint) => {
    await workspace(page);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete " + name,
      }),
    );
    expect(api).not.toHaveBeenCalledWith(endpoint, "DELETE");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete " + name }));
    fireEvent.click(screen.getByRole("button", { name: "Delete record" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(endpoint, "DELETE"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Delete " + name })).toBeNull();
  },
);

test("creates a PayPal method with explicit currency and enablement", async () => {
  await workspace("Payments");
  fireEvent.click(screen.getByRole("button", { name: "Add payment method" }));
  change("Display name", "PayPal test");
  change("Provider", "PAYPAL");
  change("Currency", "EUR");
  fireEvent.click(screen.getByLabelText("Enable this payment method"));
  submitDialog();
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/payments", "POST", {
      name: "PayPal test",
      provider: "PAYPAL",
      currency: "EUR",
      enabled: true,
    }),
  );
});

test("edits a payment method and reports provider failures honestly", async () => {
  await workspace("Payments");
  fireEvent.click(
    await screen.findByRole("button", { name: "Test connection" }),
  );
  expect((await screen.findByRole("status")).textContent).toContain(
    "Sandbox credentials are not configured",
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit Test Stripe" }));
  change("Display name", "Updated Stripe");
  submitDialog();
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/payments/gateway",
      "PUT",
      expect.objectContaining({ name: "Updated Stripe" }),
    ),
  );
});

test("creates an itinerary with destination details and participant selection", async () => {
  await workspace("Travel plans");
  fireEvent.click(screen.getByRole("button", { name: "Create travel plan" }));
  change("Travel plan name", "New journey");
  change("Start date", "2027-02-01");
  change("End date", "2027-02-03");
  for (const [label, value] of [
    ["Destination", "Manama"],
    ["Country", "Bahrain"],
    ["Activities", "Museum"],
    ["Accommodation", "Hotel"],
    ["Transportation", "Bus"],
  ])
    change(label, value);
  fireEvent.click(screen.getByRole("checkbox", { name: /Traveller/ }));
  submitDialog();
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/travels",
      "POST",
      expect.objectContaining({
        title: "New journey",
        startDate: "2027-02-01",
        participantIds: ["person"],
        version: 0,
        stops: [
          expect.objectContaining({
            destination: "Manama",
            accommodation: "Hotel",
            transportation: "Bus",
          }),
        ],
      }),
    ),
  );
});

test("keeps the itinerary editor and entered data when the server rejects a stale edit", async () => {
  await workspace("Travel plans");
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit Japan journey" }),
  );
  change("Travel plan name", "Unsaved revision");
  vi.mocked(api).mockRejectedValueOnce(
    new Error("This itinerary changed. Refresh before saving."),
  );
  submitDialog();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "This itinerary changed",
  );
  expect(
    (screen.getByLabelText("Travel plan name") as HTMLInputElement).value,
  ).toBe("Unsaved revision");
  expect(api).toHaveBeenCalledWith(
    "/travels/trip",
    "PUT",
    expect.objectContaining({ title: "Unsaved revision", version: 2 }),
  );
});

test("opens itinerary details and filters search results", async () => {
  await workspace("Travel plans");
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "View Japan journey" }))[0],
  );
  expect(within(screen.getByRole("dialog")).getByText("Walking")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  change("Search travel plans", "no match");
  expect(screen.getByText("No journeys found")).toBeTruthy();
});

test("clears open forms and records on session expiry", async () => {
  await workspace("People");
  fireEvent.click(screen.getByRole("button", { name: "Add person" }));
  fireEvent(window, new Event("session-expired"));
  await screen.findByRole("button", { name: "Sign in" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("Traveller")).toBeNull();
  expect(setCsrf).toHaveBeenLastCalledWith("");
});
