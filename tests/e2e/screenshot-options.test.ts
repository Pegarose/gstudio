import assert from "node:assert/strict";
import test from "node:test";

import { releaseScreenshotOptions } from "./screenshot-options";

test("release screenshots allow zero unmasked pixel difference", () => {
  assert.equal(releaseScreenshotOptions.maxDiffPixelRatio, 0);
  assert.equal(releaseScreenshotOptions.threshold, 0);
});
