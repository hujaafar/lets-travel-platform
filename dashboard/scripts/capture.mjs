import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const output = process.env.CAPTURE_DIR || "test-results/screenshots";
fs.mkdirSync(output, { recursive: true });
const { ADMIN_PASSWORD } = JSON.parse(
  fs.readFileSync("../.secrets/bootstrap.json", "utf8"),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 1040 },
});
await context.addInitScript(() => {
  Element.prototype.requestPointerLock = () => Promise.resolve();
  Element.prototype.setPointerCapture = () => {};
});
const page = await context.newPage();
await page.goto("https://localhost:8443");
await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page
  .getByRole("heading", { level: 1 })
  .filter({ hasText: "The departure" })
  .waitFor();
await page.locator(".dispatch-cover").waitFor();
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: path.join(output, "dashboard-desktop.png"),
  fullPage: true,
});
await page.getByRole("button", { name: "Explore itinerary" }).click();
await page.screenshot({ path: path.join(output, "itinerary-desktop.png") });
await page.getByRole("button", { name: "Close dialog" }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.waitForFunction(
  () =>
    getComputedStyle(document.querySelector(".sidebar")).visibility ===
    "hidden",
);
await page.screenshot({
  path: path.join(output, "dashboard-mobile.png"),
  fullPage: true,
});
console.log("Screenshots saved to " + output);
await browser.close();
