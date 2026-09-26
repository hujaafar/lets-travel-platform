// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./api";
import TransactionLedger from "./TransactionLedger";
vi.mock("./api", () => ({ api: vi.fn() }));
const rows = [
  {
    id: "12345678-1111",
    travel_title: "Kyoto mornings",
    traveler_name: "Maya Bennett",
    amount: 1200,
    currency: "USD",
    provider: "STRIPE",
    status: "CONFIRMED",
    is_demo: true,
    created_at: "2026-09-01",
  },
  {
    id: "98765432-2222",
    travel_title: "Island time",
    traveler_name: "Omar Rahman",
    amount: 950,
    currency: "USD",
    provider: "PAYPAL",
    status: "REFUNDED",
    is_demo: false,
    created_at: "2026-09-02",
  },
];
beforeEach(() => vi.mocked(api).mockResolvedValue(rows));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows provider, traveler and amount with explicit fixture provenance", async () => {
  render(<TransactionLedger />);
  const row = (await screen.findByText("Kyoto mornings")).closest("tr")!;
  expect(within(row).getByText("Demo")).toBeTruthy();
  expect(within(row).getByText("$1,200.00")).toBeTruthy();
  expect(within(row).getByText("Stripe")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /refund|charge/i })).toBeNull();
});
it("combines status and traveler searches and can recover from no matches", async () => {
  render(<TransactionLedger />);
  await screen.findByText("Kyoto mornings");
  fireEvent.change(screen.getByLabelText("Filter transaction status"), {
    target: { value: "REFUNDED" },
  });
  expect(screen.queryByText("Kyoto mornings")).toBeNull();
  fireEvent.change(screen.getByLabelText("Search transactions"), {
    target: { value: "Maya" },
  });
  expect(screen.getByText("No transactions match this view.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search transactions"), {
    target: { value: "Omar" },
  });
  expect(screen.getByText("Island time")).toBeTruthy();
});
it("reports API failures", async () => {
  vi.mocked(api).mockRejectedValue(Error("Unable to load payment history"));
  render(<TransactionLedger />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Unable to load",
  );
});
