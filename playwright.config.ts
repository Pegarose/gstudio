import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:9010";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never", outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-320",
      use: { browserName: "chromium", viewport: { width: 320, height: 844 } },
    },
    {
      name: "chromium-375",
      use: { browserName: "chromium", viewport: { width: 375, height: 844 } },
    },
    {
      name: "chromium-414",
      use: { browserName: "chromium", viewport: { width: 414, height: 844 } },
    },
    {
      name: "chromium-768",
      use: { browserName: "chromium", viewport: { width: 768, height: 900 } },
    },
    {
      name: "chromium-1440",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev -- -p 9010",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
