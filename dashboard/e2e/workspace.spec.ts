import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";

const origin = process.env.TRAVEL_PLAN_URL || "https://localhost:8443";
const secretPath = path.resolve("../.secrets/bootstrap.json");
const password =
  process.env.ADMIN_PASSWORD ||
  JSON.parse(fs.readFileSync(secretPath, "utf8")).ADMIN_PASSWORD;

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The departure desk.", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-metric-value]").first()).not.toHaveText(
    "00",
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestPointerLock = () => Promise.resolve();
    Element.prototype.setPointerCapture = () => {};
  });
});

test("sign in, explore destinations, navigate all screens, and sign out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await page.getByRole("button", { name: "Explore itinerary" }).click();
  const tabs = page.getByRole("tab");
  if ((await tabs.count()) > 1) {
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Getting around");
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const label of ["Travel plans", "People", "Payments", "Calendar"]) {
    await page
      .getByRole("button", { name: new RegExp("^" + label) })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("itinerary editor creates, edits, searches, and deletes persisted plans", async ({
  page,
}) => {
  const title = "Browser itinerary " + Date.now();
  await signIn(page);
  await page
    .getByRole("button", { name: "Create travel plan", exact: true })
    .first()
    .click();
  await page.getByLabel("Travel plan name").fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Browser-tested itinerary.");
  await page.getByLabel("Start date").fill("2027-01-10");
  await page.getByLabel("End date").fill("2027-01-15");
  await page.getByLabel("Destination", { exact: true }).fill("Ubud");
  await page.getByLabel("Country", { exact: true }).fill("Indonesia");
  await page.getByLabel("Activities", { exact: true }).fill("Cooking workshop");
  await page
    .getByLabel("Accommodation", { exact: true })
    .fill("Boutique hotel");
  await page.getByLabel("Transportation", { exact: true }).fill("Private car");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create travel plan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Travel plans/ })
    .first()
    .click();
  await page.getByLabel("Search travel plans").fill(title);
  await expect(page.locator(".travel-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Edit " + title, exact: true })
    .click();
  await page.getByLabel("Travel plan name").fill(title + " revised");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page
    .getByRole("button", { name: /^Travel plans/ })
    .first()
    .click();
  await page.getByLabel("Search travel plans").fill(title);
  await expect(
    page.getByRole("heading", { name: title + " revised", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete " + title + " revised", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete record", exact: true })
    .click();
  await expect(page.getByText("No journeys found")).toBeVisible();
});

test("session expiry clears open dialogs and the next sign-in starts with fresh workspace data", async ({
  page,
}) => {
  await signIn(page);
  for (const dialog of ["editor", "detail", "delete"]) {
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Travel plans", exact: true })
      .click();
    if (dialog === "editor") {
      await page
        .getByRole("button", { name: "Create travel plan", exact: true })
        .click();
      await page
        .getByLabel("Travel plan name")
        .fill("Unsaved previous-session draft");
    } else {
      await page
        .getByRole("button", {
          name: dialog === "detail" ? /^View / : /^Delete /,
        })
        .first()
        .click();
    }
    await expect(page.getByRole("dialog")).toBeVisible();
    // Exercise the same event api.ts emits on an expired authenticated request.
    // This tests local session cleanup, not the server's expiration policy.
    await page.evaluate(() =>
      window.dispatchEvent(new Event("session-expired")),
    );
    await expect(page.locator(".login-form")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const pending: Array<() => void> = [];
    const dataRoutes = /\/api\/(travels|users|payments)$/;
    await page.route(dataRoutes, async (route) => {
      await new Promise<void>((resume) => pending.push(resume));
      await route.continue();
    });
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".app")).toHaveAttribute("data-page", "overview");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-metric-value]").first()).toHaveText("00");
    await expect.poll(() => pending.length).toBe(3);
    pending.forEach((resume) => resume());
    await expect(page.locator("[data-metric-value]").first()).not.toHaveText(
      "00",
    );
    await page.unroute(dataRoutes);
  }
});

test("phone layout, reduced motion, and accessibility", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  for (const label of [
    "Overview",
    "Travel plans",
    "People",
    "Payments",
    "Calendar",
    "Settings",
  ]) {
    if (label !== "Overview") {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page
        .locator(".sidebar")
        .getByRole("button", { name: new RegExp("^" + label) })
        .first()
        .click();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator(".footer")).toBeVisible();
  }
});

test("API validates roles, CSRF, cascading deletes, stale edits, and revoked sessions", async ({
  playwright,
}) => {
  const admin = await playwright.request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Origin: origin },
  });
  const login = await admin.post("/api/auth/login", {
    data: { email: "admin@travelplan.local", password },
  });
  expect(login.status()).toBe(200);
  const me = await login.json();
  const headers = { "X-CSRF-Token": me.csrf };
  const uid = Date.now();
  const createdUsers: string[] = [];
  let travelId = "";
  let gatewayId = "";
  try {
    const userInput = {
      name: "API traveller",
      email: `api-${uid}@example.test`,
      role: "VIEWER",
      status: "ACTIVE",
      password: "LongTestPassword!42",
    };
    expect((await admin.post("/api/users", { data: userInput })).status()).toBe(
      403,
    );
    const create = await admin.post("/api/users", { data: userInput, headers });
    expect(create.status()).toBe(201);
    const userId = (await create.json()).id;
    createdUsers.push(userId);
    const input = {
      title: "API test itinerary",
      startDate: "2027-02-02",
      endDate: "2027-02-05",
      status: "DRAFT",
      price: 1400,
      capacity: 3,
      description: "Integration verification",
      image: "bali",
      stops: [
        {
          destination: "Ubud",
          country: "Indonesia",
          activities: "Walking",
          accommodation: "Hotel",
          transportation: "Car",
        },
      ],
      participantIds: [userId],
      version: 0,
    };
    expect(
      (
        await admin.post("/api/travels", {
          headers,
          data: { ...input, endDate: "2027-01-01" },
        })
      ).status(),
    ).toBe(400);
    const trip = await admin.post("/api/travels", { headers, data: input });
    expect(trip.status()).toBe(201);
    travelId = (await trip.json()).id;
    expect(
      (
        await admin.put("/api/travels/" + travelId, {
          headers,
          data: { ...input, title: "Updated once" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await admin.put("/api/travels/" + travelId, { headers, data: input })
      ).status(),
    ).toBe(409);
    const viewer = await playwright.request.newContext({
      baseURL: origin,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { Origin: origin },
    });
    const viewerLogin = await viewer.post("/api/auth/login", {
      data: { email: userInput.email, password: userInput.password },
    });
    expect(viewerLogin.status()).toBe(200);
    const viewerMe = await viewerLogin.json();
    for (const endpoint of [
      "/api/users",
      "/api/travels",
      "/api/payments",
      "/api/travels/graph-status",
    ])
      expect((await viewer.get(endpoint)).status()).toBe(403);
    // A role change must take effect for the existing session on every service.
    expect(
      (
        await admin.put("/api/users/" + userId, {
          headers,
          data: { ...userInput, role: "TRAVEL_MANAGER", password: "" },
        })
      ).status(),
    ).toBe(200);
    for (const endpoint of ["/api/users", "/api/travels", "/api/payments"])
      expect((await viewer.get(endpoint)).status()).toBe(403);
    expect(
      (
        await viewer.delete("/api/travels/" + travelId, {
          headers: { "X-CSRF-Token": viewerMe.csrf },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await admin.delete("/api/users/" + userId, { headers })).status(),
    ).toBe(200);
    expect((await viewer.get("/api/auth/me")).status()).toBe(401);
    await viewer.dispose();
    const trips = await (await admin.get("/api/travels")).json();
    expect(
      trips.find((t: { id: string }) => t.id === travelId).participantIds,
    ).toEqual([]);
    const gateway = await admin.post("/api/payments", {
      headers,
      data: {
        name: "Test gateway",
        provider: "STRIPE",
        currency: "USD",
        enabled: false,
      },
    });
    expect(gateway.status()).toBe(201);
    gatewayId = (await gateway.json()).id;
    expect(
      (
        await admin.put("/api/payments/" + gatewayId, {
          headers,
          data: {
            name: "Updated gateway",
            provider: "PAYPAL",
            currency: "USD",
            enabled: false,
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await admin.post("/api/payments/" + gatewayId + "/test", { headers })
      ).status(),
    ).toBe(503);
    expect(
      (await admin.delete("/api/users/" + me.id, { headers })).status(),
    ).toBe(409);
    expect((await admin.post("/api/auth/logout", { headers })).status()).toBe(
      204,
    );
    expect((await admin.get("/api/travels")).status()).toBe(401);
  } finally {
    const again = await admin.post("/api/auth/login", {
      data: { email: "admin@travelplan.local", password },
    });
    const csrf = (await again.json()).csrf;
    const h = { "X-CSRF-Token": csrf };
    if (travelId)
      await admin.delete("/api/travels/" + travelId, { headers: h });
    if (gatewayId)
      await admin.delete("/api/payments/" + gatewayId, { headers: h });
    for (const id of createdUsers)
      await admin.delete("/api/users/" + id, { headers: h });
    await admin.post("/api/auth/logout", { headers: h });
    await admin.dispose();
  }
});
