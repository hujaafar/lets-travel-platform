import { chromium } from "playwright";
import fs from "node:fs";
const password = JSON.parse(
  fs.readFileSync("../.secrets/bootstrap.json", "utf8"),
).ADMIN_PASSWORD;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
await page.goto("https://localhost:8443");
await page.getByLabel("Password", { exact: true }).fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.locator(".journey-card").first().waitFor();
for (const label of ["People", "Payments", "Calendar", "Settings"]) {
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: label, exact: true })
    .click();
  console.log(
    label,
    await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
      nodes: [...document.querySelectorAll("body *")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.right > innerWidth + 1;
        })
        .map((e) => ({
          tag: e.tagName,
          class: e.className,
          width: e.getBoundingClientRect().width,
          right: e.getBoundingClientRect().right,
        }))
        .slice(0, 15),
    })),
  );
}
await browser.close();
