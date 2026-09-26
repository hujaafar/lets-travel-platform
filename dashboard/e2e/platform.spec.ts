import { test, expect } from "@playwright/test";
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";

const demo = JSON.parse(
  fs.readFileSync("../.secrets/demo-accounts.json", "utf8"),
);
for (const role of ["traveler", "manager"]) {
  test(`${role} has a responsive, accessible role workspace`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.getByLabel("Email address").fill(demo[role].email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(demo[role].password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Less ordinary. More alive." }),
    ).toBeVisible();
    await expect(page.locator(".lt-card").first()).toBeVisible();
    const heroAnimation = await page
      .locator(".lt-marquee > div")
      .evaluate((e) => getComputedStyle(e).animationName);
    expect(heroAnimation).not.toBe("none");
    await page.screenshot({
      path: `../work/verification/${info.project.name}-${role}-desktop.png`,
      fullPage: true,
    });
    const access = await new AxeBuilder({ page })
      .include(".lt-app")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(access.violations).toEqual([]);
    await page.locator(".lt-card").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Traveler voices" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    if (role === "manager") {
      await page
        .getByRole("button", { name: "Manager studio", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Create a journey" }),
      ).toBeVisible();
      await expect(page.locator(".lt-table-trip").first()).toBeVisible();
    } else
      await expect(
        page.getByRole("button", { name: "Manager studio" }),
      ).toHaveCount(0);
    await page
      .getByRole("button", { name: "My journeys", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Plans worth looking forward to." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "My space", exact: true }).click();
    await expect(
      page.getByText("Past journeys", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `../work/verification/${info.project.name}-${role}-mobile.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
test("manager can create and delete a journey through the UI", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill(demo.manager.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(demo.manager.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Manager studio", exact: true })
    .click();
  await page.getByRole("button", { name: "Create a journey" }).click();
  const title = "Browser journey " + Date.now();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Journey title").fill(title);
  await dialog.getByLabel("Departure").fill("2027-05-01");
  await dialog.getByLabel("Return", { exact: true }).fill("2027-05-05");
  for (const [label, value] of [
    ["Destination", "Kyoto"],
    ["Country", "Japan"],
    ["Activities", "Culture"],
    ["Accommodation", "Ryokan"],
    ["Transportation", "Rail"],
  ])
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByRole("button", { name: "Save journey" }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
});
