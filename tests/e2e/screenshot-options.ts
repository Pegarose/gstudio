import path from "node:path";

export const releaseScreenshotOptions = {
  fullPage: true,
  animations: "disabled" as const,
  stylePath: path.resolve("tests/e2e/screenshot-mask.css"),
  maxDiffPixelRatio: 0,
};
