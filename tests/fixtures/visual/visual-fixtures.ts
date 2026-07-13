import { PNG } from "pngjs";

interface FixtureLayout {
  viewport: { width: number; height: number };
  landmarks: Array<{
    id: string;
    role: string;
    box: { x: number; y: number; width: number; height: number };
  }>;
  typography: Array<{
    role: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
  }>;
  colors: Array<{
    token: string;
    value: string;
    weight: number;
  }>;
  spacing: Array<{
    id: string;
    gap: number;
    padding: { top: number; right: number; bottom: number; left: number };
  }>;
  responsive: Array<{
    width: number;
    horizontalOverflow: boolean;
    landmarkOrder: string[];
    columns: number;
  }>;
}

export interface VisualFixtureBundle {
  desktopScreenshot: {
    png: Buffer;
    viewport: { width: number; height: number; devicePixelRatio: number };
  };
  mobileScreenshot: {
    png: Buffer;
    viewport: { width: number; height: number; devicePixelRatio: number };
  };
  desktopLayout: FixtureLayout;
  mobileLayout: FixtureLayout;
}

export function solidPng(width: number, height: number, rgba: readonly [number, number, number, number]): Buffer {
  const image = new PNG({ width, height });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = rgba[0];
    image.data[offset + 1] = rgba[1];
    image.data[offset + 2] = rgba[2];
    image.data[offset + 3] = rgba[3];
  }
  return PNG.sync.write(image);
}

export function replacePixel(png: Buffer, x: number, y: number, rgba: readonly [number, number, number, number]): Buffer {
  const image = PNG.sync.read(png);
  const offset = (y * image.width + x) * 4;
  image.data[offset] = rgba[0];
  image.data[offset + 1] = rgba[1];
  image.data[offset + 2] = rgba[2];
  image.data[offset + 3] = rgba[3];
  return PNG.sync.write(image);
}

export function createVisualFixtures(): { source: VisualFixtureBundle; output: VisualFixtureBundle } {
  const desktopScreenshot = solidPng(10, 10, [255, 255, 255, 255]);
  const mobileScreenshot = solidPng(5, 10, [255, 255, 255, 255]);
  const createLayout = (width: number, height: number): FixtureLayout => ({
    viewport: { width, height },
    landmarks: [
      { id: "header", role: "banner", box: { x: 0, y: 0, width, height: height * 0.2 } },
      { id: "hero", role: "main", box: { x: 0, y: height * 0.2, width, height: height * 0.5 } },
      { id: "action", role: "button", box: { x: 0, y: height * 0.7, width: width * 0.4, height: height * 0.2 } },
    ],
    typography: [
      { role: "h1", fontFamily: "Inter", fontSize: 48, fontWeight: 700, lineHeight: 56 },
      { role: "body", fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 24 },
    ],
    colors: [
      { token: "paper", value: "#ffffff", weight: 0.8 },
      { token: "ink", value: "#111111", weight: 0.2 },
    ],
    spacing: [
      { id: "hero", gap: 1, padding: { top: 1, right: 1, bottom: 1, left: 1 } },
      { id: "action", gap: 1, padding: { top: 0.5, right: 1, bottom: 0.5, left: 1 } },
    ],
    responsive: [
      { width: 320, horizontalOverflow: false, landmarkOrder: ["header", "hero", "action"], columns: 1 },
      { width: 1440, horizontalOverflow: false, landmarkOrder: ["header", "hero", "action"], columns: 2 },
    ],
  });
  const desktopLayout = createLayout(10, 10);
  const mobileLayout = createLayout(5, 10);

  return {
    source: {
      desktopScreenshot: { png: Buffer.from(desktopScreenshot), viewport: { width: 10, height: 10, devicePixelRatio: 1 } },
      mobileScreenshot: { png: Buffer.from(mobileScreenshot), viewport: { width: 5, height: 10, devicePixelRatio: 1 } },
      desktopLayout: structuredClone(desktopLayout),
      mobileLayout: structuredClone(mobileLayout),
    },
    output: {
      desktopScreenshot: { png: Buffer.from(desktopScreenshot), viewport: { width: 10, height: 10, devicePixelRatio: 1 } },
      mobileScreenshot: { png: Buffer.from(mobileScreenshot), viewport: { width: 5, height: 10, devicePixelRatio: 1 } },
      desktopLayout: structuredClone(desktopLayout),
      mobileLayout: structuredClone(mobileLayout),
    },
  };
}
