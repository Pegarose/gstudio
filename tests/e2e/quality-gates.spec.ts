import { expect, test } from "@playwright/test";

import { expectNoHorizontalDocumentOverflow } from "./fixtures";
import { releaseScreenshotOptions } from "./screenshot-options";

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
  await expect(page).toHaveScreenshot("passing.png", releaseScreenshotOptions);
});
