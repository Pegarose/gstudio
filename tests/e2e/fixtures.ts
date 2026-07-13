import { expect, type Page } from "@playwright/test";

export async function expectNoHorizontalDocumentOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));

  expect(
    dimensions.documentWidth,
    `document width ${dimensions.documentWidth}px exceeds viewport width ${dimensions.viewportWidth}px`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth);
}
