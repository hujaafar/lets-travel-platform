import { test, expect } from "@playwright/test";
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
const account = JSON.parse(
  fs.readFileSync("../.secrets/demo-accounts.json", "utf8"),
).traveler;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestPointerLock = async () => {};
    Element.prototype.setPointerCapture = () => {};
  });
  await page.goto("/");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".lt-scenes")).toBeVisible();
});

test("scroll changes the hero, photographs, route and destination with native navigation", async ({
  page,
}, info) => {
  await expect(
    page.getByRole("heading", { name: "Find your kind of elsewhere." }),
  ).toBeVisible();
  const scene = page.locator(".lt-scenes");
  const destinations = await page
    .locator(".lt-scene-tabs button")
    .allTextContents();
  expect(new Set(destinations).size).toBe(destinations.length);
  const positions = await scene.evaluate((e) => ({
    top:
      e.getBoundingClientRect().top +
      scrollY -
      parseFloat(getComputedStyle(e.firstElementChild as HTMLElement).top),
    span:
      (e as HTMLElement).offsetHeight -
      (e.firstElementChild as HTMLElement).offsetHeight,
  }));
  for (const [name, progress] of [
    ["opening", 0],
    ["middle", 0.5],
    ["arrival", 1],
  ] as const) {
    await page.evaluate(
      ({ top, span, progress }) => window.scrollTo(0, top + span * progress),
      { ...positions, progress },
    );
    await expect
      .poll(async () => Number(await scene.getAttribute("data-progress")))
      .toBeCloseTo(progress, 1);
    await page.screenshot({
      path: `../work/verification/${info.project.name}-motion-${name}.png`,
    });
  }
  await expect(page.locator(".lt-scene-tabs button").last()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const violations = await new AxeBuilder({ page })
    .include(".lt-scenes")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.getByRole("button", { name: "Explore this journey" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("mobile scene has usable controls and no horizontal overflow", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".lt-scenes").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Explore this journey" }),
  ).toBeVisible();
  await page.screenshot({
    path: `../work/verification/${info.project.name}-motion-mobile.png`,
  });
});

test("paused motion keeps destination selection functional without a pinned scroll span", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await page.locator(".lt-scenes").scrollIntoViewIfNeeded();
  const last = page.locator(".lt-scene-tabs button").last();
  await last.click();
  await expect(last).toHaveAttribute("aria-pressed", "true");
  expect(
    await page
      .locator(".lt-scenes-stage")
      .evaluate((e) => getComputedStyle(e).position),
  ).toBe("relative");
  expect(
    await page
      .locator(".lt-voyage-copy")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page.screenshot({
    path: `../work/verification/${info.project.name}-motion-reduced.png`,
  });
});
