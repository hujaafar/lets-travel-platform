import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

const traveler = JSON.parse(
  fs.readFileSync("../.secrets/demo-accounts.json", "utf8"),
).traveler;
async function signIn(page: Page) {
  await page.addInitScript(() => {
    Element.prototype.requestPointerLock = async () => {};
    Element.prototype.setPointerCapture = () => {};
  });
  await page.goto("/");
  await page.getByLabel("Email address").fill(traveler.email);
  await page.getByLabel("Password", { exact: true }).fill(traveler.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "GO BEYOND." })).toBeVisible();
}

test("the ascent moves its camera, supports direct chapters and pauses atmosphere", async ({
  page,
}, info) => {
  await signIn(page);
  const ascent = page.locator(".lt-ascent");
  await expect(ascent).toHaveAttribute("data-renderer", /webgl|poster/);
  if ((await ascent.getAttribute("data-renderer")) === "webgl") {
    const canvas = page.locator(".lt-ascent-canvas");
    const before = await canvas.getAttribute("data-camera");
    await page.getByRole("button", { name: "horizon", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "FIND YOUR WORLD." }),
    ).toBeVisible();
    await expect
      .poll(() => canvas.getAttribute("data-camera"))
      .not.toBe(before);
    await expect
      .poll(async () => Number(await ascent.getAttribute("data-progress")))
      .toBeCloseTo(1, 1);
    await page
      .getByRole("button", { name: "Pause atmosphere", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Resume atmosphere" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Resume atmosphere" }).click();
    await expect(
      page.getByRole("button", { name: "Pause atmosphere" }),
    ).toHaveAttribute("aria-pressed", "false");
  } else {
    await expect(ascent).toHaveClass(/is-static/);
  }
  await page.screenshot({
    path: `../work/verification/${info.project.name}-ascent-arrival.png`,
  });
  await page.getByRole("link", { name: "Find your next journey" }).click();
  await expect(page.getByLabel("Search journeys")).toBeInViewport();
  await page.locator(".lt-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the mobile horizon keeps all text and controls inside the viewport", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const ascent = page.locator(".lt-ascent");
  await expect(ascent).toHaveAttribute("data-renderer", /webgl|poster/);
  if ((await ascent.getAttribute("data-renderer")) === "webgl") {
    await page.getByRole("button", { name: "horizon", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "FIND YOUR WORLD." }),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: "Find your next journey" }),
  ).toBeInViewport();
  await page.screenshot({
    path: `../work/verification/${info.project.name}-ascent-mobile.png`,
  });
});

for (const mode of ["reduced motion", "WebGL unavailable"] as const) {
  test(`${mode} uses a complete poster and skips the long camera journey`, async ({
    page,
  }, info) => {
    if (mode === "reduced motion")
      await page.emulateMedia({ reducedMotion: "reduce" });
    else
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          type: string,
          ...args: unknown[]
        ) {
          if (type.startsWith("webgl")) return null;
          return original.apply(this, [type, ...args] as Parameters<
            typeof original
          >);
        } as typeof original;
      });
    await signIn(page);
    await expect(page.locator(".lt-ascent")).toHaveClass(/is-static/);
    expect(
      await page
        .locator(".lt-ascent-stage")
        .evaluate((e) => getComputedStyle(e).position),
    ).toBe("relative");
    expect(
      await page
        .locator(".lt-ascent-poster img")
        .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
    ).toBe(true);
    await page.screenshot({
      path: `../work/verification/${info.project.name}-ascent-${mode === "reduced motion" ? "reduced" : "fallback"}.png`,
    });
    await page.getByRole("link", { name: "Find your next journey" }).click();
    await expect(page.getByLabel("Search journeys")).toBeInViewport();
  });
}
