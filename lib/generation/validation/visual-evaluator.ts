import {
  compareScreenshots,
  type ScreenshotEvidence,
  type VisualDiffArtifact,
  VisualComparisonError,
} from "./image-comparator";
import {
  compareLayouts,
  type LayoutComparison,
  type LayoutEvidence,
} from "./layout-comparator";

export type VisualViewportName = "desktop" | "mobile";

/**
 * Validation-ready view of the canonical reference capture. The source
 * capture retains its desktop/mobile screenshot names; callers supply the
 * paired browser-derived layout evidence without invoking persistence.
 */
export interface VisualEvidenceBundle {
  desktopScreenshot: ScreenshotEvidence;
  mobileScreenshot: ScreenshotEvidence;
  desktopLayout: LayoutEvidence;
  mobileLayout: LayoutEvidence;
}

export interface VisualFidelityInput {
  source: VisualEvidenceBundle;
  output: VisualEvidenceBundle;
}

export interface VisualViewportEvaluation extends LayoutComparison {
  screenshot: number;
  mismatchedPixels: number;
  diffArtifact: VisualDiffArtifact;
}

export interface VisualFidelityEvaluation {
  structure: number;
  typography: number;
  color: number;
  spacing: number;
  responsive: number;
  screenshot: number;
  viewports: Record<VisualViewportName, VisualViewportEvaluation>;
  diffArtifacts: Record<VisualViewportName, VisualDiffArtifact>;
}

export function evaluateVisualFidelity({ source, output }: VisualFidelityInput): VisualFidelityEvaluation {
  const desktop = evaluateViewport(source.desktopLayout, output.desktopLayout, source.desktopScreenshot, output.desktopScreenshot);
  const mobile = evaluateViewport(source.mobileLayout, output.mobileLayout, source.mobileScreenshot, output.mobileScreenshot);

  return {
    structure: averageAxis(desktop.structure, mobile.structure),
    typography: averageAxis(desktop.typography, mobile.typography),
    color: averageAxis(desktop.color, mobile.color),
    spacing: averageAxis(desktop.spacing, mobile.spacing),
    responsive: averageAxis(desktop.responsive, mobile.responsive),
    screenshot: averageAxis(desktop.screenshot, mobile.screenshot),
    viewports: { desktop, mobile },
    diffArtifacts: {
      desktop: desktop.diffArtifact,
      mobile: mobile.diffArtifact,
    },
  };
}

function evaluateViewport(
  sourceLayout: LayoutEvidence,
  outputLayout: LayoutEvidence,
  sourceScreenshot: ScreenshotEvidence,
  outputScreenshot: ScreenshotEvidence,
): VisualViewportEvaluation {
  const layout = compareLayouts(sourceLayout, outputLayout);
  const screenshot = compareScreenshots(sourceScreenshot, outputScreenshot);
  return { ...layout, ...screenshot };
}

function averageAxis(first: number, second: number): number {
  return (first + second) / 2;
}

export { VisualComparisonError };
export type {
  ScreenshotEvidence,
  ScreenshotMask,
  ScreenshotViewport,
  VisualComparisonErrorCode,
  VisualDiffArtifact,
} from "./image-comparator";
export type {
  BoundingBox,
  ColorEvidence,
  LandmarkEvidence,
  LayoutEvidence,
  ResponsiveEvidence,
  SpacingEvidence,
  TypographyEvidence,
} from "./layout-comparator";
