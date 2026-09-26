import { test, expect } from "@playwright/test";
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
const accounts = JSON.parse(
  fs.readFileSync("../.secrets/demo-accounts.json", "utf8"),
);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestPointerLock = async () => {};
    Element.prototype.setPointerCapture = () => {};
  });
});
test("demo booking history is useful but cannot pretend to charge or refund", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill(accounts.traveler.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.traveler.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "My journeys", exact: true }).click();
  const examples = page
    .locator(".lt-booking")
    .filter({ hasText: "Demo booking" });
  await expect(examples.first()).toBeVisible();
  expect(await examples.count()).toBeGreaterThanOrEqual(6);
  await expect(
    examples.getByRole("button", {
      name: /Check payment|Continue checkout|Cancel booking/,
    }),
  ).toHaveCount(0);
  await page.screenshot({ path: "../work/verification/demo-journeys.png" });
});
test("admin transaction journal shows labeled examples and filters their statuses", async ({
  page,
}, info) => {
  await page.goto("/admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill(
      JSON.parse(fs.readFileSync("../.secrets/bootstrap.json", "utf8"))
        .ADMIN_PASSWORD,
    );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "The departure desk.", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  const ledger = page.getByRole("region", { name: "Transaction history" });
  await expect(ledger.locator("tbody tr").first()).toBeVisible();
  expect(await ledger.getByText("Demo", { exact: true }).count()).toBe(64);
  await page.getByLabel("Filter transaction status").selectOption("REFUNDED");
  await expect(ledger.locator("tbody tr").first()).toContainText("Refunded");
  await page.getByLabel("Search transactions").fill("no-such-example");
  await expect(
    ledger.getByText("No transactions match this view."),
  ).toBeVisible();
  await page.getByLabel("Search transactions").fill("");
  await page.getByLabel("Filter transaction status").selectOption("ALL");
  await ledger.scrollIntoViewIfNeeded();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".transaction-ledger")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `../work/verification/${info.project.name}-demo-ledger.png`,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
