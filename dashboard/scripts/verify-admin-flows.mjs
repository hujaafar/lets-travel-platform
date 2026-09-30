import { chromium, firefox } from "playwright";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// These are real form interactions with the fictional portable adapter.
// They do not validate live authentication, database cascades or providers.
const browserName = process.env.DESIGN_BROWSER || "chrome";
const browser = await (browserName === "firefox"
  ? firefox.launch()
  : chromium.launch({ channel: "chrome" }));
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [],
  requests = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (request.url().startsWith("http")) requests.push(request.url());
});
const output = path.resolve(process.env.DESIGN_SHOTS || "test-results/design");
fs.mkdirSync(output, { recursive: true });
const go = async (name) => {
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
};
const button = (name) => page.getByRole("button", { name, exact: true });
const dialog = () => page.getByRole("dialog");
async function save(label = "Save changes") {
  await dialog().getByRole("button", { name: label, exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
}
try {
  await page.goto(
    pathToFileURL(
      path.resolve(process.env.PREVIEW_PATH || "design-preview.html"),
    ).href,
    { waitUntil: "domcontentloaded" },
  );
  await page.locator(".sidebar").waitFor();
  await go("People");
  await button("Add person").click();
  await dialog()
    .getByLabel("Full name", { exact: true })
    .fill("Audit traveller");
  await dialog()
    .getByLabel("Email address", { exact: true })
    .fill("audit@example.test");
  await dialog().getByLabel("Password", { exact: true }).fill("😀".repeat(19));
  await dialog()
    .getByRole("button", { name: "Create person", exact: true })
    .click();
  await expect(dialog().getByRole("alert")).toContainText("72");
  checks.push(
    "Oversized UTF-8 password is rejected before submitting the person form",
  );
  await dialog()
    .getByLabel("Password", { exact: true })
    .fill("Preview-regression-42");
  await save("Create person");
  await button("Edit Audit traveller").click();
  await dialog()
    .getByLabel("Full name", { exact: true })
    .fill("Audit traveller revised");
  await dialog().locator('select[name="role"]').selectOption("TRAVEL_MANAGER");
  await dialog().locator('select[name="status"]').selectOption("SUSPENDED");
  await save();
  await expect(
    page.getByRole("row").filter({ hasText: "audit@example.test" }),
  ).toContainText(/suspended/i);
  await page.reload({ waitUntil: "domcontentloaded" });
  await go("People");
  await button("Delete Audit traveller revised").click();
  await save("Delete record");
  await expect(
    page.getByText("audit@example.test", { exact: true }),
  ).toHaveCount(0);
  checks.push(
    "Person form creation, role/status edit, reload persistence and deletion",
  );

  await go("Payments");
  await button("Add payment method").click();
  await dialog()
    .getByLabel("Display name", { exact: true })
    .fill("Audit gateway");
  await dialog().locator('select[name="provider"]').selectOption("PAYPAL");
  await save("Create payment method");
  await button("Edit Audit gateway").click();
  await dialog().locator('select[name="currency"]').selectOption("EUR");
  await save();
  const gateway = page
    .locator(".payment-card")
    .filter({ hasText: "Audit gateway" });
  await expect(gateway).toContainText("EUR");
  await expect(gateway).toContainText(/not configured/i);
  await button("Delete Audit gateway").click();
  await save("Delete record");
  await expect(page.getByText("Audit gateway", { exact: true })).toHaveCount(0);
  checks.push(
    "Payment-method form creation, currency edit, honest configuration status and deletion",
  );

  await go("Travel plans");
  const title = await page.locator(".travel-row h3").first().innerText();
  await button("Edit " + title).click();
  await dialog()
    .getByLabel("Price per person (USD)", { exact: true })
    .fill("1680.25");
  await save();
  await expect(
    page.locator(".travel-row").filter({ hasText: title }),
  ).toContainText("$1,680.25");
  checks.push("Fractional travel price remains visible after saving");

  await button("Edit " + title).click();
  await dialog().locator('input[name="startDate"]').fill("2028-03-10");
  await dialog().locator('input[name="endDate"]').fill("2028-03-09");
  await dialog()
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog().getByRole("alert")).toContainText(
    "End date must be on or after start date",
  );
  await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
  checks.push(
    "Invalid travel dates keep the editor open with an actionable error",
  );

  await go("Settings");
  await button("Edit account").click();
  await dialog()
    .getByLabel("Full name", { exact: true })
    .fill("Audit workspace admin");
  await dialog()
    .getByLabel("Email address", { exact: true })
    .fill("admin-audit@example.test");
  await save();
  await expect(page.locator(".settings-profile")).toContainText(
    "Audit workspace admin",
  );
  await expect(page.locator(".settings-profile")).toContainText(
    "admin-audit@example.test",
  );
  checks.push(
    "Self-edit refreshes the active account name and email without reloading",
  );

  // Inject a failed portable response, exercising the real rendered refresh/retry
  // path without pretending that a production payment service was stopped.
  await page.evaluate(() => {
    const original = window.fetch;
    window.restoreAuditFetch = () => {
      window.fetch = original;
    };
    window.fetch = (input, options) =>
      input === "/api/payments" &&
      (!options?.method || options.method === "GET")
        ? Promise.resolve(
            new Response(
              JSON.stringify({ message: "Temporary audit outage" }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              },
            ),
          )
        : original(input, options);
  });
  await button("Edit account").click();
  await dialog()
    .getByLabel("Full name", { exact: true })
    .fill("Available workspace admin");
  await save();
  await expect(page.locator(".settings-profile")).toContainText(
    "Available workspace admin",
  );
  await expect(page.locator(".error-banner")).toContainText(
    "Payments: Temporary audit outage",
  );
  await go("Travel plans");
  await expect(
    page.locator(".travel-row").filter({ hasText: title }),
  ).toHaveCount(1);
  await go("Payments");
  await expect(page.locator(".payment-card")).toHaveCount(2);
  await page.evaluate(() => {
    window.restoreAuditFetch();
    delete window.restoreAuditFetch;
  });
  await button("Try again").click();
  await expect(page.locator(".error-banner")).toHaveCount(0);
  checks.push(
    "A failed payments refresh preserves healthy updates and cached gateways; retry recovers",
  );

  await go("People");
  await button("Add person").click();
  await dialog()
    .getByLabel("Full name", { exact: true })
    .fill("Unsaved private draft");
  await page.evaluate(() => window.dispatchEvent(new Event("session-expired")));
  await page.locator(".login-form").waitFor();
  await page.getByLabel("Password", { exact: true }).fill("preview-regression");
  await button("Sign in").click();
  await page.locator(".sidebar").waitFor();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  checks.push(
    "Session expiry clears an open private draft before the next sign-in",
  );
  await expect(errors).toEqual([]);
  await expect(requests).toEqual([]);
  fs.writeFileSync(
    path.join(output, "admin-flows-verification.json"),
    JSON.stringify(
      {
        browser: browserName,
        version: browser.version(),
        scope: "Portable fictional frontend forms; not live services",
        checks,
        errors,
        externalRequests: requests,
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(
    `${browserName}: ${checks.length} admin form/regression flows passed.`,
  );
} finally {
  await browser.close();
}
