import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
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
  await expect(
    page.getByRole("heading", { name: "Find your kind of elsewhere." }),
  ).toBeVisible();
}

test("the coastal window expands independently of its postcard and keeps search accessible", async ({
  page,
}, info) => {
  await signIn(page);
  const hero = page.locator(".lt-voyage");
  const picture = page.locator(".lt-voyage-window");
  const initial = (await picture.boundingBox())!;
  const postcard = await page
    .locator(".lt-postcard")
    .evaluate((e) => getComputedStyle(e).transform);
  const positions = await hero.evaluate((e) => ({
    top: e.getBoundingClientRect().top + scrollY - 78,
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
      ({ positions, progress }) =>
        scrollTo(0, positions.top + positions.span * progress),
      { positions, progress },
    );
    await expect
      .poll(async () => Number(await hero.getAttribute("data-progress")))
      .toBeCloseTo(progress, 1);
    await page.screenshot({
      path: `../work/verification/${info.project.name}-travel-${name}.png`,
    });
  }
  expect((await picture.boundingBox())!.width).toBeGreaterThan(
    initial.width * 1.5,
  );
  expect(
    await page
      .locator(".lt-postcard")
      .evaluate((e) => getComputedStyle(e).transform),
  ).not.toBe(postcard);
  await expect(
    page.getByRole("button", { name: "Explore journeys", exact: true }),
  ).toBeInViewport();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".lt-voyage")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Explore journeys", exact: true })
    .click();
  await expect(page.getByLabel("Search journeys")).toBeFocused();
  await expect(page.getByLabel("Search journeys")).toBeInViewport();
  await page.locator("#collection .lt-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("travel interests filter real journeys and the all-journeys action restores them", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.locator("#collection .lt-card").first()).toBeVisible();
  const initial = await page.locator("#collection .lt-card").count();
  await page.getByRole("button", { name: "Discover journeys in Bali" }).click();
  await expect(page.getByLabel("Search journeys")).toHaveValue("Bali");
  await expect(page.locator("#collection .lt-card").first()).toContainText(
    /Bali/i,
  );
  await page.getByRole("button", { name: "Culture & cities" }).click();
  await expect(page.getByLabel("Search journeys")).toHaveValue("Culture");
  await expect(
    page.getByRole("button", { name: "Culture", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#collection .lt-card")).toContainText([
    /Bali/i,
    /Japanese/i,
  ]);
  await page.getByRole("button", { name: "All journeys", exact: true }).click();
  await expect(page.locator("#collection .lt-card")).toHaveCount(initial);
});

test("mobile has a natural-flow hero with no overlapping copy or horizontal overflow", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  expect(
    await page
      .locator(".lt-voyage-stage")
      .evaluate((e) => getComputedStyle(e).position),
  ).toBe("relative");
  const copy = (await page.locator(".lt-voyage-copy").boundingBox())!;
  const picture = (await page.locator(".lt-voyage-window").boundingBox())!;
  expect(picture.y).toBeGreaterThan(copy.y + copy.height + 12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Explore journeys", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: `../work/verification/${info.project.name}-travel-mobile.png`,
  });
  await page.getByRole("button", { name: "Coast & calm" }).click();
  await expect(page.getByLabel("Search journeys")).toHaveValue("Beach");
  await expect(page.getByLabel("Search journeys")).toBeInViewport();
});

test("motion pause persists and leaves all destination selection usable", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect(page.locator(".lt-app")).toHaveClass(/lt-motion-off/);
  expect(
    await page
      .locator(".lt-voyage-window img")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".lt-scenes-stage")
      .evaluate((e) => getComputedStyle(e).position),
  ).toBe("relative");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Enable motion", exact: true }),
  ).toBeVisible();
  const last = page.locator(".lt-scene-tabs button").last();
  await last.click();
  await expect(last).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Explore this journey" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("system reduced motion defaults to a complete static scene and supports an explicit override", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await expect(page.locator(".lt-app")).toHaveClass(/lt-motion-off/);
  expect(
    await page
      .locator(".lt-voyage-stage")
      .evaluate((e) => getComputedStyle(e).position),
  ).toBe("relative");
  expect(
    await page
      .locator(".lt-voyage-window img")
      .evaluate((e) => (e as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await page.screenshot({
    path: `../work/verification/${info.project.name}-travel-reduced.png`,
  });
  await page
    .getByRole("button", { name: "Enable motion", exact: true })
    .click();
  await expect(page.locator(".lt-app")).toHaveClass(/lt-motion-on/);
  expect(
    await page
      .locator(".lt-voyage-stage")
      .evaluate((e) => getComputedStyle(e).position),
  ).toBe("sticky");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Pause motion", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use system setting" }).click();
  await expect(page.locator(".lt-app")).toHaveClass(/lt-motion-off/);
});
