import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.TRAVEL_PLAN_URL || "https://localhost:8443",
    // Local development CA only. Service-to-service TLS is verified independently.
    ignoreHTTPSErrors: true,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: {
        browserName: "chromium",
        channel: process.env.PLAYWRIGHT_CHROMIUM ? undefined : "chrome",
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "firefox",
      use: { browserName: "firefox", viewport: { width: 1440, height: 1000 } },
    },
  ],
});
