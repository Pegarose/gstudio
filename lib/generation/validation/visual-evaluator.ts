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

/**
 * Minimal durable-image projection of the architecture's CapturedImage.
 * Artifact bytes remain outside this contract and are resolved only through
 * the injected reader below.
 */
export interface CapturedImageReference {
  artifactKey: string;
  mediaType: "image/png";
  width: number;
  height: number;
  devicePixelRatio: number;
  masks?: ScreenshotEvidence["masks"];
}

export interface CapturedVisualEvidenceBundle {
  desktopScreenshot: CapturedImageReference;
  mobileScreenshot: CapturedImageReference;
  desktopLayout: LayoutEvidence;
  mobileLayout: LayoutEvidence;
}

export interface CapturedImageReader {
  readPng(image: CapturedImageReference): Promise<Buffer>;
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

/**
 * Resolves durable PNG artifacts at the edge of visual validation without
 * coupling the evaluator to a database, artifact store, or capture provider.
 */
export async function adaptCapturedVisualEvidence(
  input: CapturedVisualEvidenceBundle,
  reader: CapturedImageReader,
): Promise<VisualEvidenceBundle> {
  const [desktopPng, mobilePng] = await Promise.all([
    reader.readPng(input.desktopScreenshot),
    reader.readPng(input.mobileScreenshot),
  ]);

  return {
    desktopScreenshot: screenshotEvidenceFromCapture(input.desktopScreenshot, desktopPng),
    mobileScreenshot: screenshotEvidenceFromCapture(input.mobileScreenshot, mobilePng),
    desktopLayout: input.desktopLayout,
    mobileLayout: input.mobileLayout,
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

function screenshotEvidenceFromCapture(captured: CapturedImageReference, png: Buffer): ScreenshotEvidence {
  return {
    png,
    viewport: {
      width: captured.width,
      height: captured.height,
      devicePixelRatio: captured.devicePixelRatio,
    },
    masks: captured.masks,
  };
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
