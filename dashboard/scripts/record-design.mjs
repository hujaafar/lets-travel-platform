import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const preview = path.resolve(process.env.PREVIEW_PATH || "design-preview.html");
const output = path.resolve(process.env.DESIGN_SHOTS || "test-results/design");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: {
    dir: path.resolve("test-results/recordings"),
    size: { width: 1280, height: 900 },
  },
});
await context.addInitScript(() => {
  Element.prototype.requestPointerLock = () => Promise.resolve();
  Element.prototype.setPointerCapture = () => {};
});
const page = await context.newPage();
await page.goto(pathToFileURL(preview).href, { waitUntil: "domcontentloaded" });
await page.locator(".launch-stage").waitFor();
await page.evaluate(async () => {
  await document.fonts.ready;
  for (const i of document.images) i.loading = "eager";
  await Promise.all(
    [...document.images].map((i) => i.decode().catch(() => {})),
  );
});
const shot = (name) =>
  page.screenshot({ path: path.join(output, name + ".png") });
async function move(top, duration) {
  await page.evaluate(
    async ({ top, duration }) => {
      const from = scrollY,
        start = performance.now();
      await new Promise((done) => {
        function paint(now) {
          const p = Math.min(1, (now - start) / duration),
            ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          window.scrollTo({
            top: from + (top - from) * ease,
            behavior: "instant",
          });
          if (p < 1) requestAnimationFrame(paint);
          else done();
        }
        requestAnimationFrame(paint);
      });
    },
    { top, duration },
  );
}
async function to(selector, duration, offset = 120) {
  const top = await page
    .locator(selector)
    .first()
    .evaluate(
      (e, gap) => e.getBoundingClientRect().top + scrollY - gap,
      offset,
    );
  await move(top, duration);
}
async function scene(selector, stageSelector, progress, duration) {
  const top = await page
    .locator(selector)
    .evaluate(
      (e, { stageSelector, progress }) =>
        e.getBoundingClientRect().top +
        scrollY -
        22 +
        (e.offsetHeight - e.querySelector(stageSelector).offsetHeight) *
          progress,
      { stageSelector, progress },
    );
  await move(top, duration);
}
await page.waitForTimeout(800);
await shot("orbit-earth");
for (const [progress, duration] of [
  [0.2, 1800],
  [0.44, 2300],
  [0.69, 2200],
  [0.96, 2400],
]) {
  const top = await page
    .locator(".orbital-intro")
    .evaluate(
      (el, p) =>
        el.getBoundingClientRect().top +
        scrollY +
        (el.offsetHeight - el.querySelector(".orbit-stage").offsetHeight) * p,
      progress,
    );
  await move(top, duration);
  if (progress === 0.44 || progress === 0.96) await page.waitForTimeout(500);
  const name = new Map([
    [0.2, "orbit-turn"],
    [0.44, "orbit-route"],
    [0.69, "orbit-descent"],
    [0.96, "orbit-arrival"],
  ]).get(progress);
  await shot(name);
}
await scene(".launch-runway", ".launch-stage", 0, 1400);
await scene(".launch-runway", ".launch-stage", 1, 4200);
await to(".desk-numbers", 1500, 180);
await page.waitForTimeout(500);
await to('[data-route-stop="0"]', 1800, 220);
await page.waitForTimeout(700);
await to('[data-route-stop="1"]', 1800, 220);
await page.waitForTimeout(1100);
await scene(".collection-runway", ".collection-stage", 0, 1900);
await page.waitForTimeout(650);
await shot("gallery-start");
await scene(".collection-runway", ".collection-stage", 1, 4300);
await page.waitForTimeout(650);
await to(".desk-close", 1800, 80);
await page.waitForTimeout(1300);
await shot("scroll-close");
const video = page.video();
await context.close();
await video.saveAs(path.join(output, "design-motion.webm"));
const homePage = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
});
await homePage.goto(pathToFileURL(preview).href, {
  waitUntil: "domcontentloaded",
});
await homePage.locator(".dispatch-cover").waitFor();
await homePage.evaluate(async () => {
  await document.fonts.ready;
  for (const image of document.images) image.loading = "eager";
  await Promise.all(
    [...document.images].map((image) => image.decode().catch(() => {})),
  );
});
// Each panel is an unretouched viewport at a real native-scroll position.
// Full-page screenshots cannot represent the active states of sticky scenes.
const homeStages = [
  ["Orbital departure", "home-orbital", ".orbital-intro"],
  ["The departure desk", "home-departure-desk", ".dispatch-opening"],
  ["Workspace at a glance", "home-metrics", ".desk-numbers"],
  ["The itinerary", "home-itinerary", ".journey-reader"],
  [
    "The collection",
    "home-collection",
    ".collection-runway",
    ".collection-stage",
  ],
  ["Where next", "home-closing", ".desk-close"],
];
for (const [, name, selector, stageSelector] of homeStages) {
  await homePage.locator(selector).evaluate((element, stageSelector) => {
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
  }, stageSelector);
  await homePage.waitForTimeout(1000);
  await homePage.screenshot({ path: path.join(output, name + ".png") });
}
await homePage.close();
const sheet = await browser.newPage({
  viewport: { width: 1600, height: 1800 },
});
async function contactSheet(file, title, frames) {
  await sheet.setContent(
    "<html><style>body{margin:0;padding:30px;background:#080e14;color:#f4f0e6;font:14px Arial}h1{font-size:26px;margin:0 0 12px}p{color:#e7ab87;margin:0 0 24px}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}figure{margin:0}img{width:100%;height:480px;object-fit:contain;background:#080e14}figcaption{padding:8px 0;font-size:13px}</style><h1>" +
      title +
      "</h1><p>Original viewport captures at native scroll positions</p><main>" +
      frames
        .map(
          ([name, label], index) =>
            '<figure><img src="data:image/png;base64,' +
            fs
              .readFileSync(path.join(output, name + ".png"))
              .toString("base64") +
            '"><figcaption>' +
            String(index + 1).padStart(2, "0") +
            " / " +
            label +
            "</figcaption></figure>",
        )
        .join("") +
      "</main></html>",
  );
  await sheet.evaluate(() =>
    Promise.all([...document.images].map((i) => i.decode())),
  );
  await sheet.screenshot({
    path: path.join(output, file + ".png"),
    fullPage: true,
  });
}
await contactSheet("scroll-contact-sheet", "Travel Plan · Scroll sequence", [
  ["orbit-earth", "The world"],
  ["orbit-route", "The route"],
  ["orbit-descent", "The descent"],
  ["orbit-arrival", "The arrival"],
  ["gallery-start", "Saved journeys"],
  ["scroll-close", "Where next"],
]);
await contactSheet(
  "home-contact-sheet",
  "Travel Plan · One continuous workspace",
  homeStages.map(([label, name]) => [name, label]),
);
await browser.close();
console.log(
  "Scroll recording, motion contact sheet and Home contact sheet saved.",
);
