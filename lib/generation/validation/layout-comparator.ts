export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LandmarkEvidence {
  id: string;
  role: string;
  box: BoundingBox;
}

export interface TypographyEvidence {
  role: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
}

export interface ColorEvidence {
  token: string;
  value: string;
  weight: number;
}

export interface SpacingEvidence {
  id: string;
  gap: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface ResponsiveEvidence {
  width: number;
  horizontalOverflow: boolean;
  landmarkOrder: string[];
  columns: number;
}

export interface LayoutEvidence {
  viewport: {
    width: number;
    height: number;
  };
  landmarks: LandmarkEvidence[];
  typography: TypographyEvidence[];
  colors: ColorEvidence[];
  spacing: SpacingEvidence[];
  responsive: ResponsiveEvidence[];
}

export interface LayoutComparison {
  structure: number;
  typography: number;
  color: number;
  spacing: number;
  responsive: number;
}

const REQUIRED_MOBILE_RESPONSIVE_WIDTHS = [320, 375, 414, 768] as const;
const MINIMUM_DESKTOP_RESPONSIVE_WIDTH = 1024;

export function compareLayouts(source: LayoutEvidence, output: LayoutEvidence): LayoutComparison {
  assertLayoutViewport(source.viewport, "source");
  assertLayoutViewport(output.viewport, "output");
  assertCompleteResponsiveEvidence(source.responsive, "source");
  assertCompleteResponsiveEvidence(output.responsive, "output");

  return {
    structure: compareStructure(source, output),
    typography: compareTypography(source.typography, output.typography),
    color: compareColorHistograms(source.colors, output.colors),
    spacing: compareSpacing(source, output),
    responsive: compareResponsive(source.responsive, output.responsive),
  };
}

function compareStructure(source: LayoutEvidence, output: LayoutEvidence): number {
  if (source.landmarks.length === 0) return output.landmarks.length === 0 ? 1 : 0;

  const orderMatches = source.landmarks.reduce((matches, landmark, index) => (
    matches + Number(output.landmarks[index]?.id === landmark.id && output.landmarks[index]?.role === landmark.role)
  ), 0);
  const orderScore = orderMatches / Math.max(source.landmarks.length, output.landmarks.length);
  const outputById = new Map(output.landmarks.map((landmark) => [landmark.id, landmark]));
  const boxScore = source.landmarks.reduce((sum, landmark) => {
    const candidate = outputById.get(landmark.id);
    return sum + (candidate && candidate.role === landmark.role
      ? normalizedBoundingBoxScore(landmark.box, source.viewport, candidate.box, output.viewport)
      : 0);
  }, 0) / source.landmarks.length;

  return clampScore((orderScore + boxScore) / 2);
}

function compareTypography(source: TypographyEvidence[], output: TypographyEvidence[]): number {
  if (source.length === 0) return output.length === 0 ? 1 : 0;

  const sourceScale = Math.max(...source.map((item) => item.fontSize));
  const outputScale = output.length > 0 ? Math.max(...output.map((item) => item.fontSize)) : 1;
  const consumedOutput = new Set<number>();
  const total = source.reduce((sum, item) => {
    const outputIndex = output.findIndex((candidate, index) => candidate.role === item.role && !consumedOutput.has(index));
    if (outputIndex < 0) return sum;
    consumedOutput.add(outputIndex);
    const candidate = output[outputIndex];
    const directSizeScore = relativeDifferenceScore(item.fontSize, candidate.fontSize, 0.5);
    const sizeRatioScore = relativeDifferenceScore(item.fontSize / sourceScale, candidate.fontSize / outputScale, 0.5);
    const weightScore = relativeDifferenceScore(item.fontWeight, candidate.fontWeight, 0.5);
    const lineHeightScore = relativeDifferenceScore(item.lineHeight, candidate.lineHeight, 0.5);
    const familyScore = normalizeText(item.fontFamily) === normalizeText(candidate.fontFamily) ? 1 : 0;

    return sum + (directSizeScore * 0.65
      + sizeRatioScore * 0.1
      + weightScore * 0.1
      + lineHeightScore * 0.1
      + familyScore * 0.05);
  }, 0);

  return clampScore(total / source.length);
}

function compareColorHistograms(source: ColorEvidence[], output: ColorEvidence[]): number {
  const sourceHistogram = normalizedColorHistogram(source);
  const outputHistogram = normalizedColorHistogram(output);
  if (sourceHistogram.size === 0) return outputHistogram.size === 0 ? 1 : 0;

  const keys = new Set([...sourceHistogram.keys(), ...outputHistogram.keys()]);
  const totalVariation = [...keys].reduce((sum, key) => (
    sum + Math.abs((sourceHistogram.get(key) ?? 0) - (outputHistogram.get(key) ?? 0))
  ), 0);
  const distributionScore = 1 - totalVariation / 2;
  const exactTokenColorScore = [...keys].filter((key) => sourceHistogram.has(key) && outputHistogram.has(key)).length / keys.size;

  return clampScore((distributionScore + exactTokenColorScore) / 2);
}

function compareSpacing(source: LayoutEvidence, output: LayoutEvidence): number {
  if (source.spacing.length === 0) return output.spacing.length === 0 ? 1 : 0;

  const outputById = new Map(output.spacing.map((item) => [item.id, item]));
  const total = source.spacing.reduce((sum, item) => {
    const candidate = outputById.get(item.id);
    if (!candidate) return sum;
    const sourceValues = normalizeSpacing(item, source.viewport);
    const outputValues = normalizeSpacing(candidate, output.viewport);
    const score = sourceValues.reduce((valueSum, value, index) => (
      valueSum + absoluteDifferenceScore(value, outputValues[index], 0.1)
    ), 0) / sourceValues.length;
    return sum + score;
  }, 0);

  return clampScore(total / source.spacing.length);
}

function compareResponsive(source: ResponsiveEvidence[], output: ResponsiveEvidence[]): number {
  const outputByWidth = new Map(output.map((item) => [item.width, item]));
  const total = source.reduce((sum, item) => {
    const candidate = outputByWidth.get(item.width);
    if (!candidate) return sum;
    const overflowScore = Number(item.horizontalOverflow === candidate.horizontalOverflow);
    const orderScore = orderedItemsScore(item.landmarkOrder, candidate.landmarkOrder);
    const columnScore = Number(item.columns === candidate.columns);
    return sum + (overflowScore + orderScore + columnScore) / 3;
  }, 0);

  return clampScore((total / source.length) ** REQUIRED_MOBILE_RESPONSIVE_WIDTHS.length);
}

function assertCompleteResponsiveEvidence(evidence: ResponsiveEvidence[], label: string): void {
  const widths = new Set<number>();
  for (const item of evidence) {
    if (widths.has(item.width)) {
      throw new TypeError(`${label} responsive evidence has Duplicate responsive width ${item.width}px.`);
    }
    widths.add(item.width);
  }

  for (const requiredWidth of REQUIRED_MOBILE_RESPONSIVE_WIDTHS) {
    if (!widths.has(requiredWidth)) {
      throw new TypeError(`${label} responsive evidence is Missing required responsive width ${requiredWidth}px.`);
    }
  }

  const nonMobileWidths = evidence.map((item) => item.width).filter((width) => !REQUIRED_MOBILE_RESPONSIVE_WIDTHS.includes(width as typeof REQUIRED_MOBILE_RESPONSIVE_WIDTHS[number]));
  const invalidDesktopWidth = nonMobileWidths.find((width) => !Number.isFinite(width) || width < MINIMUM_DESKTOP_RESPONSIVE_WIDTH);
  if (invalidDesktopWidth !== undefined) {
    throw new TypeError(`${label} Desktop responsive width must be at least 1024px; received ${invalidDesktopWidth}px.`);
  }
  if (nonMobileWidths.length !== 1) {
    throw new TypeError(`${label} responsive evidence must include exactly one desktop width of at least 1024px.`);
  }
}

function normalizedBoundingBoxScore(source: BoundingBox, sourceViewport: LayoutEvidence["viewport"], output: BoundingBox, outputViewport: LayoutEvidence["viewport"]): number {
  const sourceValues = [
    source.x / sourceViewport.width,
    source.y / sourceViewport.height,
    source.width / sourceViewport.width,
    source.height / sourceViewport.height,
  ];
  const outputValues = [
    output.x / outputViewport.width,
    output.y / outputViewport.height,
    output.width / outputViewport.width,
    output.height / outputViewport.height,
  ];

  return sourceValues.reduce((sum, value, index) => sum + absoluteDifferenceScore(value, outputValues[index], 1), 0) / sourceValues.length;
}

function normalizeSpacing(item: SpacingEvidence, viewport: LayoutEvidence["viewport"]): number[] {
  return [
    item.gap / Math.min(viewport.width, viewport.height),
    item.padding.top / viewport.height,
    item.padding.right / viewport.width,
    item.padding.bottom / viewport.height,
    item.padding.left / viewport.width,
  ];
}

function normalizedColorHistogram(colors: ColorEvidence[]): Map<string, number> {
  const totalWeight = colors.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight === 0) return new Map();

  return colors.reduce((histogram, item) => {
    const key = `${normalizeText(item.token)}|${normalizeText(item.value)}`;
    histogram.set(key, (histogram.get(key) ?? 0) + Math.max(0, item.weight) / totalWeight);
    return histogram;
  }, new Map<string, number>());
}

function orderedItemsScore(source: string[], output: string[]): number {
  if (source.length === 0) return output.length === 0 ? 1 : 0;
  const matches = source.reduce((sum, item, index) => sum + Number(output[index] === item), 0);
  return matches / Math.max(source.length, output.length);
}

function relativeDifferenceScore(reference: number, candidate: number, toleratedDifference: number): number {
  if (!Number.isFinite(reference) || !Number.isFinite(candidate) || reference <= 0 || candidate <= 0) return 0;
  return clampScore(1 - Math.abs(reference - candidate) / reference / toleratedDifference);
}

function absoluteDifferenceScore(reference: number, candidate: number, toleratedDifference: number): number {
  if (!Number.isFinite(reference) || !Number.isFinite(candidate)) return 0;
  return clampScore(1 - Math.abs(reference - candidate) / toleratedDifference);
}

function assertLayoutViewport(viewport: LayoutEvidence["viewport"], label: string): void {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    throw new TypeError(`${label} layout viewport must have positive finite dimensions.`);
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}
