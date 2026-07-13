import assert from "node:assert/strict";

import { expect, test } from "@playwright/test";

import { releaseScreenshotOptions } from "./screenshot-options";

test("an unmasked one-pixel difference is rejected by the release matcher", async ({ page }) => {
  const response = await page.goto("/test-fixtures/passing?variant=one-pixel-diff");

  expect(response?.ok()).toBe(true);
  await assert.rejects(() => expect(page).toHaveScreenshot("passing.png", releaseScreenshotOptions));
});
