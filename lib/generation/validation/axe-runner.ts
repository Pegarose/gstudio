import { readFile } from "node:fs/promises";
import { join } from "node:path";

let axeSourcePromise: Promise<string> | undefined;

/**
 * Keep axe as raw runtime text. Bundling axe-core into the Next route changes
 * the UMD closure that Playwright injects and can produce ReferenceError `b`
 * inside the preview page.
 */
export function readBundledAxeSource(): Promise<string> {
  axeSourcePromise ??= readFile(join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf8");
  return axeSourcePromise;
}
