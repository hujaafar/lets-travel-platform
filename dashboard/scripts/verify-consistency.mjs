import { chromium, firefox } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Read-only visual coverage for the portable sample workspace. This does not
// exercise payment processing or make claims about a running backend.
const preview = path.resolve(process.env.PREVIEW_PATH || "design-preview.html");
const output = path.resolve(
  process.env.DESIGN_SHOTS || "test-results/consistency",
);
fs.mkdirSync(output, { recursive: true });
const browserName = process.env.DESIGN_BROWSER || "chrome";
const launchBrowser = () =>
  browserName === "firefox"
    ? firefox.launch()
    : chromium.launch({ channel: "chrome" });
const checks = [],
  failures = [],
  screenshots = [],
  runtimeErrors = [],
  readinessDiagnostics = [];
let activeStage = null;
const pages = [
  "Overview",
  "Travel plans",
  "People",
  "Payments",
  "Calendar",
  "Settings",
];
const slug = (text) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/-$/, "");

function writeReport(complete = false) {
  fs.writeFileSync(
    path.join(output, "consistency-verification.json"),
    JSON.stringify(
      {
        browser: browserName,
        scope:
          "Read-only portable sample UI; six pages, three Home sections, forms, details, guide and sign-in at desktop and mobile sizes. Palette observations are reported for visual review, not asserted as hardcoded colors.",
        complete,
        expectedScreens: 30,
        activeStage,
        readinessDiagnostics,
        passed: complete && checks.length === 30 && failures.length === 0,
        checks,
        failures,
      },
      null,
      2,
    ) + "\n",
  );
}

// Replace any old success report before launching a runtime that may stop early.
writeReport();

async function deadline(label, operation, milliseconds = 15000) {
  let timer;
  activeStage = label;
  writeReport();
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} exceeded ${milliseconds}ms`);
          console.error(error.message);
          reject(error);
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (activeStage === label) activeStage = null;
    writeReport();
  }
}

async function settle(page, label = "workspace") {
  try {
    await deadline(
      `${label}: fonts, images and animation-frame readiness`,
      () =>
        page.evaluate(async () => {
          const state = (globalThis.__consistencyReadiness = {
            phase: "fonts",
            images: [],
          });
          await document.fonts.ready;
          state.phase = "images";
          const images = [...document.images];
          const pending = new Set(images.map((_, index) => index));
          const observeImages = () => {
            state.images = [...pending].map((index) => ({
              index,
              alt: images[index].alt,
              complete: images[index].complete,
              naturalWidth: images[index].naturalWidth,
            }));
          };
          for (const image of images) image.loading = "eager";
          observeImages();
          await Promise.all(
            images.map((image, index) =>
              image
                .decode()
                .catch(() => {})
                .finally(() => {
                  pending.delete(index);
                  observeImages();
                }),
            ),
          );
          state.phase = "animation frames";
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          state.phase = "complete";
        }),
    );
  } catch (error) {
    try {
      const diagnostic = await deadline(
        `${label}: readiness diagnostics`,
        () => page.evaluate(() => globalThis.__consistencyReadiness),
        2000,
      );
      readinessDiagnostics.push({ label, ...diagnostic });
      console.error(JSON.stringify({ readiness: { label, ...diagnostic } }));
    } catch (diagnosticError) {
      readinessDiagnostics.push({ label, error: diagnosticError.message });
    }
    throw error;
  }
  await page.waitForTimeout(220);
}

async function navigate(page, label) {
  const opener = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (
    (await opener.isVisible()) &&
    !(await page
      .locator(".sidebar")
      .evaluate((el) => el.classList.contains("open")))
  )
    await opener.click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: label, exact: true })
    .click();
  await deadline(`${label}: reset scroll`, () =>
    page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })),
  );
  await settle(page, label);
}

async function capture(page, label, size) {
  const name = `consistency-${slug(label)}-${size}`;
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width - 1, viewport.height - 1);
  await page.waitForTimeout(160);
  await page.screenshot({ path: path.join(output, name + ".png") });
  screenshots.push({ name, label, size });
  const visual = await deadline(`${label} (${size}): inspect layout`, () =>
    page.evaluate(() => {
      const selectors = [
        "html",
        "body",
        ".main",
        ".workspace",
        ".sidebar",
        ".topbar",
        ".page-heading h1",
        ".orbital-intro",
        ".desk-numbers",
        ".journey-reader",
        ".route-stop",
        ".desk-collection",
        ".desk-close",
        ".travel-card",
        ".table-wrap",
        ".payment-card",
        ".gateway-card",
        ".calendar",
        ".calendar-grid",
        ".agenda",
        ".settings-profile",
        ".settings-row",
        ".modal",
        ".modal-head",
        ".modal-body",
        ".login-form",
        ".login-story",
        ".button.primary",
        "input",
        "select",
      ];
      const surfaceSamples = selectors.flatMap((selector) => {
        const element = [...document.querySelectorAll(selector)].find((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width &&
            r.height &&
            r.bottom > 0 &&
            r.top < innerHeight &&
            r.right > 0 &&
            r.left < innerWidth &&
            getComputedStyle(el).visibility !== "hidden"
          );
        });
        if (!element) return [];
        const style = getComputedStyle(element);
        return [
          {
            selector,
            background: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            color: style.color,
            font: style.fontFamily,
            borderColor: style.borderColor,
            borderRadius: style.borderRadius,
          },
        ];
      });
      const overflow = document.documentElement.scrollWidth - innerWidth;
      const overflowElements =
        overflow > 1
          ? [...document.querySelectorAll("body *")]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return (
                  r.width > 0 &&
                  r.right > innerWidth + 1 &&
                  r.left >= 0 &&
                  getComputedStyle(el).position !== "fixed"
                );
              })
              .slice(0, 15)
              .map((el) => ({
                tag: el.tagName,
                className: String(el.className),
                right: Math.round(el.getBoundingClientRect().right),
              }))
          : [];
      return {
        viewport: { width: innerWidth, height: innerHeight },
        overflow,
        overflowElements,
        heading: document
          .querySelector("dialog[open] h2, h1, .login-form h2")
          ?.textContent?.trim(),
        surfaceSamples,
      };
    }),
  );
  const axe = await deadline(
    `${label} (${size}): accessibility analysis`,
    () =>
      new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze(),
    30000,
  );
  const violations = axe.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
  checks.push({
    label,
    size,
    screenshot: name + ".png",
    ...visual,
    violations,
  });
  if (visual.overflow > 1)
    failures.push(
      `${label} (${size}) has ${visual.overflow}px document overflow`,
    );
  if (violations.length)
    failures.push(
      `${label} (${size}): ${violations.map((v) => v.id).join(", ")}`,
    );
  console.log(
    `${browserName} ${size}: ${label}; overflow=${visual.overflow}px; axe=${violations.length}`,
  );
  writeReport();
}

async function scene(page, selector, stageSelector) {
  await deadline(`${selector}: position scroll scene`, () =>
    page.locator(selector).evaluate((element, stageSelector) => {
      const stage = stageSelector ? element.querySelector(stageSelector) : null;
      window.scrollTo({
        top:
          element.getBoundingClientRect().top +
          scrollY -
          30 +
          (stage
            ? Math.max(0, element.offsetHeight - stage.offsetHeight) * 0.42
            : 0),
        behavior: "instant",
      });
    }, stageSelector),
  );
  await settle(page, selector);
}

async function closeDialog(page) {
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}

for (const [size, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  let browser, context, page;
  try {
    // A fresh process bounds browser memory across the two complete viewports.
    browser = await deadline(`${size}: launch browser`, launchBrowser, 30000);
    context = await deadline(`${size}: create context`, () =>
      browser.newContext({
        viewport,
        reducedMotion: "no-preference",
      }),
    );
    await context.addInitScript(() => {
      Element.prototype.requestPointerLock = () => Promise.resolve();
      Element.prototype.setPointerCapture = () => {};
    });
    page = await deadline(`${size}: create page`, () => context.newPage());
    page.setDefaultTimeout(12000);
    page.on("pageerror", (error) =>
      runtimeErrors.push(`${size}: ${error.message}`),
    );
    await page.goto(pathToFileURL(preview).href);
    await page.locator(".sidebar").waitFor({ state: "attached" });
    await settle(page);
    for (const label of pages) {
      await navigate(page, label);
      await capture(page, label, size);
    }
    await navigate(page, "Overview");
    await scene(page, ".journey-reader");
    await capture(page, "Home itinerary", size);
    await scene(page, ".collection-runway", ".collection-stage");
    await capture(page, "Home collection", size);
    await scene(page, ".desk-close");
    await capture(page, "Home closing", size);

    for (const [section, action, label] of [
      ["Travel plans", "Create travel plan", "Travel editor"],
      ["People", "Add person", "Person editor"],
      ["Payments", "Add payment method", "Payment editor"],
    ]) {
      await navigate(page, section);
      await page.getByRole("button", { name: action, exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await settle(page, `${size}: ${label}`);
      await capture(page, label, size);
      await closeDialog(page);
    }
    await navigate(page, "Travel plans");
    await page
      .getByRole("button", { name: /^View / })
      .first()
      .click();
    await page.getByRole("dialog").waitFor();
    await settle(page, `${size}: travel detail`);
    await capture(page, "Travel detail", size);
    await closeDialog(page);
    const helpButton = page.getByRole("button", { name: "Help", exact: true });
    if (await helpButton.isVisible()) await helpButton.click();
    else {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Help & getting started", exact: true })
        .click();
    }
    await page.getByRole("dialog").waitFor();
    await settle(page, `${size}: workspace guide`);
    await capture(page, "Workspace guide", size);
    await closeDialog(page);
    await navigate(page, "Settings");
    await page.getByRole("button", { name: /Sign out/i }).click();
    await page.locator(".login-form").waitFor();
    await settle(page, `${size}: login`);
    await capture(page, "Login", size);
    await page
      .getByLabel("Password", { exact: true })
      .fill("preview-visual-review");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.locator(".sidebar").waitFor({ state: "attached" });
  } catch (error) {
    console.error(`${size}: ${error.stack}`);
    failures.push(`${size}: ${error.stack}`);
    await page
      ?.screenshot({
        path: path.join(output, `consistency-failure-${size}.png`),
      })
      .catch(() => {});
  } finally {
    await deadline(`${size}: close context`, () => context?.close()).catch(
      (error) => failures.push(`${size} context cleanup: ${error.message}`),
    );
    await deadline(`${size}: close browser`, () => browser?.close()).catch(
      (error) => failures.push(`${size} browser cleanup: ${error.message}`),
    );
    writeReport();
  }
}

// Contact sheets pair the same page at both widths. Actual screenshots are
// embedded locally, preserving a single portable, reviewable artifact.
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const image = (label, size) => {
  const shot = screenshots.find((s) => s.label === label && s.size === size);
  return shot
    ? `<img class="${size}" alt="${escape(label)} ${size}" src="data:image/png;base64,${fs.readFileSync(path.join(output, shot.name + ".png")).toString("base64")}">`
    : "";
};
let sheetBrowser;
try {
  sheetBrowser = await deadline(
    "Contact sheets: launch browser",
    launchBrowser,
    30000,
  );
  const sheet = await deadline("Contact sheets: create page", () =>
    sheetBrowser.newPage({
      viewport: { width: 1680, height: 1100 },
    }),
  );
  for (const [file, title, labels] of [
    [
      "all-pages-contact-sheet",
      "Travel Plan · One workspace, every screen",
      [...pages, "Home itinerary", "Home collection", "Home closing"],
    ],
    [
      "forms-contact-sheet",
      "Travel Plan · Details, forms & access",
      [
        "Travel editor",
        "Person editor",
        "Payment editor",
        "Travel detail",
        "Workspace guide",
        "Login",
      ],
    ],
  ]) {
    await deadline(`${file}: load montage`, () =>
      sheet.setContent(
        `<html><style>*{box-sizing:border-box}body{margin:0;padding:34px;background:#080e14;color:#f4f0e6;font:14px Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:25px}h1{font-size:28px;font-weight:500;margin:0}header p{color:#e7ab87;margin:0}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:26px 20px}figure{margin:0;border-top:1px solid #334049;padding-top:10px}figcaption{font-size:14px;margin-bottom:10px}.pair{display:flex;align-items:flex-start;gap:10px}.desktop{width:76%;height:auto}.mobile{width:22%;height:auto}img{display:block;border:1px solid #23343e}footer{font-size:12px;color:#aeb7bb;padding-top:22px}</style><header><h1>${title}</h1><p>Desktop 1440px / Mobile 390px</p></header><main>${labels.map((label) => `<figure><figcaption>${escape(label)}</figcaption><div class="pair">${image(label, "desktop")}${image(label, "mobile")}</div></figure>`).join("")}</main><footer>Sample workspace · ${browserName} · Original screenshots; no retouching.</footer></html>`,
      ),
    );
    await deadline(`${file}: decode screenshots`, () =>
      sheet.evaluate(() =>
        Promise.all([...document.images].map((el) => el.decode())),
      ),
    );
    await deadline(`${file}: save montage`, () =>
      sheet.screenshot({
        path: path.join(output, file + ".png"),
        fullPage: true,
      }),
    );
  }
} catch (error) {
  console.error(`Contact sheets: ${error.stack}`);
  failures.push(`Contact sheets: ${error.stack}`);
} finally {
  await deadline("Contact sheets: close browser", () =>
    sheetBrowser?.close(),
  ).catch((error) =>
    failures.push(`Contact sheet browser cleanup: ${error.message}`),
  );
}
failures.push(...runtimeErrors);
if (checks.length !== 30)
  failures.push(`Expected 30 completed screens; recorded ${checks.length}`);
writeReport(true);
console.log(
  JSON.stringify(
    { browser: browserName, checkedScreens: checks.length, failures },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
