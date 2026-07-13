import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface ScreenshotViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface ScreenshotMask {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotEvidence {
  png: Buffer;
  viewport: ScreenshotViewport;
  masks?: ScreenshotMask[];
}

export interface VisualDiffArtifact {
  filename: string;
  mediaType: "image/png";
  data: Buffer;
}

export interface ScreenshotComparison {
  screenshot: number;
  mismatchedPixels: number;
  width: number;
  height: number;
  diffArtifact: VisualDiffArtifact;
}

export type VisualComparisonErrorCode = "aspect-ratio-mismatch" | "viewport-mismatch" | "pixel-dimension-mismatch" | "invalid-mask";

export class VisualComparisonError extends Error {
  constructor(public readonly code: VisualComparisonErrorCode, message: string) {
    super(message);
    this.name = "VisualComparisonError";
  }
}

export function compareScreenshots(source: ScreenshotEvidence, output: ScreenshotEvidence): ScreenshotComparison {
  assertCompatibleViewports(source.viewport, output.viewport);

  const sourceImage = PNG.sync.read(source.png);
  const outputImage = PNG.sync.read(output.png);
  assertImageMatchesViewport(sourceImage, source.viewport, "source");
  assertImageMatchesViewport(outputImage, output.viewport, "output");

  const normalizeForPixelMatch = source.viewport.devicePixelRatio !== output.viewport.devicePixelRatio;
  const width = normalizeForPixelMatch ? source.viewport.width : sourceImage.width;
  const height = normalizeForPixelMatch ? source.viewport.height : sourceImage.height;
  const normalizedSource = normalizeForPixelMatch ? resizeImage(sourceImage, width, height) : sourceImage;
  const normalizedOutput = normalizeForPixelMatch ? resizeImage(outputImage, width, height) : outputImage;

  if (normalizedSource.width !== normalizedOutput.width || normalizedSource.height !== normalizedOutput.height) {
    throw new VisualComparisonError(
      "pixel-dimension-mismatch",
      `Pixel dimensions differ after allowed normalization: ${normalizedSource.width}x${normalizedSource.height} versus ${normalizedOutput.width}x${normalizedOutput.height}.`,
    );
  }

  const masks = [...(source.masks ?? []), ...(output.masks ?? [])];
  const comparisonDevicePixelRatio = normalizeForPixelMatch ? 1 : source.viewport.devicePixelRatio;
  const sourceForComparison = applyMasks(normalizedSource, masks, comparisonDevicePixelRatio);
  const outputForComparison = applyMasks(normalizedOutput, masks, comparisonDevicePixelRatio);
  const diff = new PNG({ width, height });
  const mismatchedPixels = pixelmatch(
    sourceForComparison.data,
    outputForComparison.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 },
  );

  return {
    screenshot: 1 - mismatchedPixels / (width * height),
    mismatchedPixels,
    width,
    height,
    diffArtifact: {
      filename: `visual-diff-${source.viewport.width}x${source.viewport.height}.png`,
      mediaType: "image/png",
      data: PNG.sync.write(diff),
    },
  };
}

function assertCompatibleViewports(source: ScreenshotViewport, output: ScreenshotViewport): void {
  assertPositiveViewport(source, "source");
  assertPositiveViewport(output, "output");

  const sourceAspectRatio = source.width / source.height;
  const outputAspectRatio = output.width / output.height;
  if (Math.abs(sourceAspectRatio - outputAspectRatio) > 0.0001) {
    throw new VisualComparisonError(
      "aspect-ratio-mismatch",
      `Screenshot aspect ratios differ: ${source.width}x${source.height} versus ${output.width}x${output.height}.`,
    );
  }

  if (source.width !== output.width || source.height !== output.height) {
    throw new VisualComparisonError(
      "viewport-mismatch",
      `Screenshot viewports differ: ${source.width}x${source.height} versus ${output.width}x${output.height}.`,
    );
  }
}

function assertPositiveViewport(viewport: ScreenshotViewport, label: string): void {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || !Number.isFinite(viewport.devicePixelRatio)
    || viewport.width <= 0 || viewport.height <= 0 || viewport.devicePixelRatio <= 0) {
    throw new VisualComparisonError(
      "pixel-dimension-mismatch",
      `${label} screenshot viewport must have positive finite dimensions and device-pixel ratio.`,
    );
  }
}

function assertImageMatchesViewport(image: PNG, viewport: ScreenshotViewport, label: string): void {
  const expectedWidth = Math.round(viewport.width * viewport.devicePixelRatio);
  const expectedHeight = Math.round(viewport.height * viewport.devicePixelRatio);
  if (image.width !== expectedWidth || image.height !== expectedHeight) {
    throw new VisualComparisonError(
      "pixel-dimension-mismatch",
      `${label} PNG dimensions ${image.width}x${image.height} do not match viewport ${expectedWidth}x${expectedHeight}.`,
    );
  }
}

function resizeImage(source: PNG, width: number, height: number): PNG {
  const resized = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor((y + 0.5) * source.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x + 0.5) * source.width / width));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      resized.data[targetOffset] = source.data[sourceOffset];
      resized.data[targetOffset + 1] = source.data[sourceOffset + 1];
      resized.data[targetOffset + 2] = source.data[sourceOffset + 2];
      resized.data[targetOffset + 3] = source.data[sourceOffset + 3];
    }
  }
  return resized;
}

function applyMasks(image: PNG, masks: ScreenshotMask[], devicePixelRatio: number): PNG {
  if (masks.length === 0) return image;

  const masked = new PNG({ width: image.width, height: image.height });
  image.data.copy(masked.data);
  for (const mask of masks) {
    assertMask(mask);
    const startX = Math.max(0, Math.floor(mask.x * devicePixelRatio));
    const startY = Math.max(0, Math.floor(mask.y * devicePixelRatio));
    const endX = Math.min(image.width, Math.ceil((mask.x + mask.width) * devicePixelRatio));
    const endY = Math.min(image.height, Math.ceil((mask.y + mask.height) * devicePixelRatio));

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const offset = (y * image.width + x) * 4;
        masked.data[offset] = 0;
        masked.data[offset + 1] = 0;
        masked.data[offset + 2] = 0;
        masked.data[offset + 3] = 255;
      }
    }
  }
  return masked;
}

function assertMask(mask: ScreenshotMask): void {
  if (!Number.isFinite(mask.x) || !Number.isFinite(mask.y) || !Number.isFinite(mask.width) || !Number.isFinite(mask.height)
    || mask.x < 0 || mask.y < 0 || mask.width <= 0 || mask.height <= 0) {
    throw new VisualComparisonError("invalid-mask", "Screenshot masks must use finite, non-negative coordinates and positive dimensions.");
  }
}
