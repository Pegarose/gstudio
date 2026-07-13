import assert from "node:assert/strict";
import { test } from "node:test";

import { PNG } from "pngjs";

import {
  VisualComparisonError,
  evaluateVisualFidelity,
} from "../../lib/generation/validation/visual-evaluator";
import { createVisualFixtures, replacePixel, solidPng } from "../fixtures/visual/visual-fixtures";

test("visual evaluation compares canonical desktop and mobile captures and returns separate diff artifacts", () => {
  const { source, output } = createVisualFixtures();

  const result = evaluateVisualFidelity({ source, output });

  assert.equal(result.structure, 1);
  assert.equal(result.typography, 1);
  assert.equal(result.color, 1);
  assert.equal(result.spacing, 1);
  assert.equal(result.responsive, 1);
  assert.equal(result.screenshot, 1);
  assert.equal(result.viewports.desktop.screenshot, 1);
  assert.equal(result.viewports.mobile.screenshot, 1);
  assert.equal(result.diffArtifacts.desktop.mediaType, "image/png");
  assert.equal(PNG.sync.read(result.diffArtifacts.mobile.data).width, 5);
});

test("a typography mismatch does not hide behind a good screenshot score", () => {
  const { source, output } = createVisualFixtures();
  for (const layout of [output.desktopLayout, output.mobileLayout]) {
    layout.typography = [{
      role: "h1",
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 700,
      lineHeight: 56,
    }];
  }

  const result = evaluateVisualFidelity({ source, output });

  assert.equal(result.screenshot, 1);
  assert.ok(result.typography < 0.6);
  assert.equal(result.structure, 1);
});

test("landmark order and normalized bounding boxes determine the structural score", () => {
  const { source, output } = createVisualFixtures();
  for (const layout of [output.desktopLayout, output.mobileLayout]) {
    layout.landmarks = [
      { ...layout.landmarks[1], box: { x: layout.viewport.width * 0.1, y: layout.viewport.height * 0.2, width: layout.viewport.width * 0.8, height: layout.viewport.height * 0.5 } },
      layout.landmarks[0],
      layout.landmarks[2],
    ];
  }

  const result = evaluateVisualFidelity({ source, output });

  assert.ok(result.structure < 0.7);
  assert.equal(result.typography, 1);
  assert.equal(result.screenshot, 1);
});

test("token color histograms are scored independently from spacing", () => {
  const { source, output } = createVisualFixtures();
  for (const layout of [output.desktopLayout, output.mobileLayout]) {
    layout.colors[1] = { token: "ink", value: "#ff0000", weight: 0.2 };
  }

  const result = evaluateVisualFidelity({ source, output });

  assert.ok(result.color < 0.6);
  assert.equal(result.spacing, 1);
  assert.equal(result.screenshot, 1);
});

test("normalized gaps and padding are scored independently from colors", () => {
  const { source, output } = createVisualFixtures();
  for (const layout of [output.desktopLayout, output.mobileLayout]) {
    layout.spacing[0] = {
      id: "hero",
      gap: 4,
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
    };
  }

  const result = evaluateVisualFidelity({ source, output });

  assert.ok(result.spacing < 0.6);
  assert.equal(result.color, 1);
  assert.equal(result.screenshot, 1);
});

test("responsive evidence records breakpoint regressions separately", () => {
  const { source, output } = createVisualFixtures();
  for (const layout of [output.desktopLayout, output.mobileLayout]) {
    layout.responsive[0] = {
      width: 320,
      horizontalOverflow: true,
      landmarkOrder: ["hero", "header", "action"],
      columns: 2,
    };
  }

  const result = evaluateVisualFidelity({ source, output });

  assert.ok(result.responsive < 0.5);
  assert.equal(result.screenshot, 1);
});

test("a declared dynamic mask removes only the masked screenshot difference", () => {
  const { source, output } = createVisualFixtures();
  output.desktopScreenshot.png = replacePixel(output.desktopScreenshot.png, 0, 0, [255, 0, 0, 255]);

  const unmasked = evaluateVisualFidelity({ source, output });
  assert.ok(unmasked.viewports.desktop.screenshot < 1);

  source.desktopScreenshot.masks = [{ x: 0, y: 0, width: 1, height: 1 }];
  const masked = evaluateVisualFidelity({ source, output });
  assert.equal(masked.viewports.desktop.screenshot, 1);
  assert.equal(masked.viewports.mobile.screenshot, 1);
});

test("mobile screenshot differences lower only the mobile screenshot result", () => {
  const { source, output } = createVisualFixtures();
  output.mobileScreenshot.png = replacePixel(output.mobileScreenshot.png, 0, 0, [255, 0, 0, 255]);

  const result = evaluateVisualFidelity({ source, output });

  assert.equal(result.viewports.desktop.screenshot, 1);
  assert.ok(result.viewports.mobile.screenshot < 1);
});

test("equal CSS viewports with different device-pixel ratios are normalized before comparison", () => {
  const { source, output } = createVisualFixtures();
  source.desktopScreenshot = {
    png: solidPng(20, 20, [255, 255, 255, 255]),
    viewport: { width: 10, height: 10, devicePixelRatio: 2 },
  };

  const result = evaluateVisualFidelity({ source, output });

  assert.equal(result.viewports.desktop.screenshot, 1);
  assert.equal(PNG.sync.read(result.diffArtifacts.desktop.data).width, 10);
});

test("different mobile screenshot aspect ratios are rejected instead of stretched into a match", () => {
  const { source, output } = createVisualFixtures();
  output.mobileScreenshot = {
    png: solidPng(6, 10, [255, 255, 255, 255]),
    viewport: { width: 6, height: 10, devicePixelRatio: 1 },
  };

  assert.throws(
    () => evaluateVisualFidelity({ source, output }),
    (error: unknown) => error instanceof VisualComparisonError && error.code === "aspect-ratio-mismatch",
  );
});
