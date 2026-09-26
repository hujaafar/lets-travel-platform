import { chromium, firefox } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const output = path.resolve(process.env.DESIGN_SHOTS || "test-results/design");
fs.mkdirSync(output, { recursive: true });
const browserName = process.env.DESIGN_BROWSER || "chrome";
const browser = await (browserName === "firefox"
  ? firefox.launch()
  : chromium.launch({ channel: "chrome" }));
const context = await browser.newContext();
await context.addInitScript(() => {
  // This suite chooses every scroll position itself. Browser restoration after
  // reload must not race with those deliberate native-scroll commands.
  history.scrollRestoration = "manual";
});
const page = await context.newPage();
const errors = [],
  checks = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) => errors.push(r.failure()?.errorText));
page.on("request", (r) => {
  if (r.url().startsWith("http")) requests.push(r.url());
});
const url = pathToFileURL(
  path.resolve(process.env.PREVIEW_PATH || "design-preview.html"),
).href;
await page.goto(url, { waitUntil: "domcontentloaded" });
async function ready() {
  await page.locator(".orbit-earth").waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const image of document.images) image.loading = "eager";
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every(
          (animation) =>
            !(animation.playState === "running" || animation.pending) ||
            !Number.isFinite(animation.effect?.getComputedTiming().endTime),
        ),
    null,
    { timeout: 10000 },
  );
}
async function reloadReady() {
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready();
}
await ready();
async function scroll(p) {
  await page.locator(".orbital-intro").evaluate(
    (el, p) =>
      scrollTo({
        top:
          el.getBoundingClientRect().top +
          scrollY +
          p * (el.offsetHeight - el.querySelector(".orbit-stage").offsetHeight),
        behavior: "instant",
      }),
    p,
  );
  // Wait for the scroll coordinate and the rendered scene to agree. A timeout
  // remains a failure; changing the DOM alone cannot satisfy this assertion.
  await page.waitForFunction(
    (expected) => {
      const element = document.querySelector(".orbital-intro");
      const stage = element?.querySelector(".orbit-stage");
      if (!element || !stage) return false;
      const span = Math.max(1, element.offsetHeight - stage.offsetHeight);
      const actual = Math.max(
        0,
        Math.min(1, -element.getBoundingClientRect().top / span),
      );
      const painted = Number(element.style.getPropertyValue("--orbit-p"));
      return (
        Math.abs(actual - expected) < 0.003 &&
        Math.abs(painted - expected) < 0.003 &&
        stage.dataset.scVerifyState !== "initial"
      );
    },
    p,
    { timeout: 5000 },
  );
}
async function shot(name) {
  await page.screenshot({ path: path.join(output, name + ".png") });
}
async function audit(width, phase) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    `overflow at ${width}`,
  );
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  ).violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
  checks.push({ width, phase, violations });
}
for (const width of [1440, 1024, 820, 700, 390, 320]) {
  await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".sample-label").count(), 0);
  const before = await page.screenshot();
  const stateBefore = await page
    .locator(".orbit-stage")
    .getAttribute("data-sc-verify-state");
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(250);
  const after = await page.screenshot();
  assert(
    !before.equals(after),
    `Earth must visibly change on the first scroll at ${width}`,
  );
  assert.notEqual(
    stateBefore,
    await page.locator(".orbit-stage").getAttribute("data-sc-verify-state"),
  );
  assert.equal(
    await page
      .locator(".orbit-stage")
      .evaluate((e) => e.scrollLeft + e.scrollTop),
    0,
  );
  assert.equal(
    await page
      .locator(".orbit-stage")
      .evaluate((e) => getComputedStyle(e).position),
    "sticky",
  );
  await scroll(0);
  await shot(width === 1440 ? "orbit-earth" : `orbit-${width}`);
  await audit(width, "world");
  if (width === 1440 || width === 390) {
    for (const [name, p] of [
      ["turn", 0.2],
      ["route", 0.44],
      ["descent", 0.69],
      ["arrival", 0.92],
    ]) {
      await scroll(p);
      await shot(`orbit-${name}${width === 390 ? "-mobile" : ""}`);
      if (name === "route" || name === "arrival") await audit(width, name);
    }
  }
}
await page.setViewportSize({ width: 1440, height: 640 });
await scroll(0.44);
await shot("orbit-short-laptop");
await audit(1440, "short laptop");
await page.setViewportSize({ width: 1440, height: 1000 });
await scroll(0);
const accelerated = (await page.locator("canvas.is-rendered").count()) === 1;
await page.getByRole("button", { name: "03 The arrival" }).click();
await page.waitForFunction(() =>
  document
    .querySelector(".orbit-chapters [aria-current]")
    ?.textContent.includes("arrival"),
);
await page
  .getByRole("button", { name: "Explore Bali, beyond the ordinary" })
  .click();
await page.getByRole("button", { name: "Close dialog", exact: true }).click();
await page.getByRole("button", { name: "Skip to workspace" }).click();
assert.equal(
  await page
    .locator("#desk-title")
    .evaluate((e) => e === document.activeElement),
  true,
);
await scroll(0);
assert.equal(
  await page.getByRole("button", { name: "Enable orbital motion" }).count(),
  0,
  "The always-on experience must not show the retired motion toggle",
);
await page.evaluate(() =>
  localStorage.setItem("travel-plan-orbit-motion", "off"),
);
await reloadReady();
await page.locator(".orbit-motion").waitFor();
assert.equal(
  await page
    .locator(".orbit-stage")
    .evaluate((e) => getComputedStyle(e).position),
  "sticky",
  "A saved choice from an older preview must not disable the scene",
);
await scroll(0);
const storedOffStart = await page
  .locator(".orbit-stage")
  .getAttribute("data-sc-verify-state");
await scroll(0.44);
assert.notEqual(
  storedOffStart,
  await page.locator(".orbit-stage").getAttribute("data-sc-verify-state"),
);
await page.emulateMedia({ reducedMotion: "reduce" });
await reloadReady();
await page.locator(".orbit-motion").waitFor();
await scroll(0);
const reducedStart = await page
  .locator(".orbit-stage")
  .getAttribute("data-sc-verify-state");
await scroll(0.44);
assert.notEqual(
  reducedStart,
  await page.locator(".orbit-stage").getAttribute("data-sc-verify-state"),
  "Scroll motion remains enabled under the system reduced-motion preference",
);
assert.equal(
  await page.locator(".orbit-route-copy").getAttribute("aria-hidden"),
  "false",
);
assert.equal(await page.locator(".orbit-static").count(), 0);
await shot("orbit-always-on");
await audit(1440, "always on with legacy off and reduced-motion preference");
await page.evaluate(() => localStorage.removeItem("travel-plan-orbit-motion"));
await page.emulateMedia({ reducedMotion: "no-preference" });
await reloadReady();
if (accelerated) {
  await page.evaluate(
    () =>
      (window.orbitTestExtension = document
        .querySelector(".orbit-earth canvas")
        .getContext("webgl")
        .getExtension("WEBGL_lose_context")),
  );
  await page.evaluate(() => window.orbitTestExtension?.loseContext());
  await page.waitForTimeout(150);
  assert.equal(
    await page
      .locator(".earth-fallback")
      .evaluate((e) => getComputedStyle(e).opacity),
    "1",
  );
  await scroll(0.44);
  await shot("orbit-fallback");
  await page.evaluate(() => window.orbitTestExtension?.restoreContext());
  await page.locator("canvas.is-rendered").waitFor();
}
await scroll(0);
await page.getByRole("button", { name: "Skip to workspace" }).focus();
await page.keyboard.press("Enter");
assert.equal(
  await page
    .locator("#desk-title")
    .evaluate((e) => e === document.activeElement),
  true,
);
await page.getByRole("button", { name: "People", exact: true }).click();
await page.getByRole("button", { name: "Overview", exact: true }).click();
await page.locator(".orbit-motion").waitFor();
await ready();
await scroll(0.44);
assert.equal(
  await page.locator(".orbit-chapters [aria-current]").textContent(),
  "02The route",
);
const result = {
  browser: browserName,
  version: browser.version(),
  scope: "Portable sample frontend",
  accelerated,
  firstScrollAllWidths: true,
  chapterControls: true,
  skipFocus: true,
  alwaysOn: true,
  legacySavedOffIgnored: true,
  systemPreferenceDoesNotDisable: true,
  retiredMotionToggleAbsent: true,
  contextLossFallback: accelerated,
  navigationRemount: true,
  checks,
  errors,
  externalRequests: requests,
};
fs.writeFileSync(
  path.join(output, "orbit-verification.json"),
  JSON.stringify(result, null, 2),
);
await browser.close();
assert.equal(errors.length, 0, JSON.stringify(errors));
assert.equal(requests.length, 0);
assert.equal(
  checks.flatMap((c) => c.violations).length,
  0,
  JSON.stringify(
    checks.filter((c) => c.violations.length),
    null,
    2,
  ),
);
console.log(
  `${browserName}: orbital motion, controls and ${checks.length} accessibility cases passed. WebGL: ${accelerated}`,
);
