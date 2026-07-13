import path from "node:path";

import { expect, test } from "@playwright/test";

import { expectNoHorizontalDocumentOverflow } from "./fixtures";

test("passing fixture is stable at mobile and desktop", async ({ page }) => {
  const response = await page.goto("/test-fixtures/passing");
  expect(response?.ok()).toBe(true);
  await expect(page.locator('[data-quality-fixture="passing"]')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  const isNextDevIndicatorVisible = await page.locator("nextjs-portal").evaluate((portal) => {
    const badge = portal.shadowRoot?.querySelector<HTMLElement>("[data-next-badge-root]");

    return Boolean(badge && getComputedStyle(badge).display !== "none");
  });
  expect(isNextDevIndicatorVisible).toBe(false);
  await expectNoHorizontalDocumentOverflow(page);
  await expect(page).toHaveScreenshot("passing.png", {
    fullPage: true,
    animations: "disabled",
    stylePath: path.resolve("tests/e2e/screenshot-mask.css"),
    maxDiffPixelRatio: 0.01,
  });
});
