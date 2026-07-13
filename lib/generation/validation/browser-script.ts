import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";

export const REQUIRED_VIEWPORT_WIDTHS = [320, 375, 414, 768] as const;

export interface BrowserScriptInput {
  url: string;
  desktopWidth: number;
}

export interface BrowserResponsiveProbe {
  width: number;
  scrollWidth: number;
  clientWidth: number;
  focusVisible: boolean;
  focusEvidence: string;
  infinitePrimaryAnimations: string[];
}

export interface AxeViolationEvidence {
  id: string;
  impact: string | null;
  helpUrl: string;
  targets: string[];
}

export interface BrowserScriptResult {
  runtimeErrors: string[];
  responsive: BrowserResponsiveProbe[];
  axeViolations: AxeViolationEvidence[];
}

export interface BrowserScriptRunner {
  run(input: BrowserScriptInput): Promise<BrowserScriptResult>;
}

interface FocusAppearance {
  outline: string;
  boxShadow: string;
  border: string;
}

interface FocusableBaseline {
  index: number;
  appearance: FocusAppearance;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const FOCUS_BASELINE_SCRIPT = [
  "(selector) => {",
  "  const getAppearance = (element) => {",
  "    const style = window.getComputedStyle(element);",
  "    return {",
  "      outline: style.outlineStyle + ' ' + style.outlineWidth + ' ' + style.outlineColor,",
  "      boxShadow: style.boxShadow,",
  "      border: style.borderTopWidth + ' ' + style.borderTopStyle + ' ' + style.borderTopColor,",
  "    };",
  "  };",
  "  return Array.from(document.querySelectorAll(selector)).map((element, index) => ({",
  "    index,",
  "    appearance: getAppearance(element),",
  "  }));",
  "}",
].join("\n");

const CURRENT_FOCUS_SCRIPT = [
  "({ selector, baselines: expectedBaselines }) => {",
  "  const getAppearance = (element) => {",
  "    const style = window.getComputedStyle(element);",
  "    return {",
  "      outline: style.outlineStyle + ' ' + style.outlineWidth + ' ' + style.outlineColor,",
  "      boxShadow: style.boxShadow,",
  "      border: style.borderTopWidth + ' ' + style.borderTopStyle + ' ' + style.borderTopColor,",
  "    };",
  "  };",
  "  const elements = Array.from(document.querySelectorAll(selector));",
  "  const activeIndex = elements.indexOf(document.activeElement);",
  "  if (activeIndex < 0) return null;",
  "  return {",
  "    index: activeIndex,",
  "    before: expectedBaselines[activeIndex] && expectedBaselines[activeIndex].appearance,",
  "    after: getAppearance(elements[activeIndex]),",
  "    tagName: elements[activeIndex].tagName.toLowerCase(),",
  "  };",
  "}",
].join("\n");

const PRIMARY_ANIMATION_SCRIPT = [
  "() => {",
  "  const primaryElements = Array.from(document.querySelectorAll(\"[data-primary-content], main, [role='main'], #root\"));",
  "  const elements = primaryElements.length > 0 ? primaryElements : [document.body];",
  "  return elements.flatMap((element) => {",
  "    const style = window.getComputedStyle(element);",
  "    const animationNames = style.animationName.split(',').map((value) => value.trim());",
  "    const animationIterations = style.animationIterationCount.split(',').map((value) => value.trim());",
  "    return animationNames.flatMap((name, index) => {",
  "      const iteration = animationIterations[index] || animationIterations[animationIterations.length - 1];",
  "      if (name === 'none' || iteration !== 'infinite') return [];",
  "      const identity = element.id ? '#' + element.id : element.tagName.toLowerCase();",
  "      return [identity + ': ' + name + ' (' + iteration + ')'];",
  "    });",
  "  });",
  "}",
].join("\n");

const DOCUMENT_FONTS_READY_SCRIPT = "async () => { await document.fonts.ready; }";
const DOCUMENT_DIMENSIONS_SCRIPT = "() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })";

function createPageCallback<Arg, Result>(source: string): (arg: Arg) => Result {
  return Function("return (" + source + ");")() as (arg: Arg) => Result;
}

function createPageExpression<Result>(source: string): () => Result {
  return Function("return (" + source + ");")() as () => Result;
}

function viewportHeight(width: number): number {
  return width < 768 ? 844 : 900;
}

function formatFocusAppearance(appearance: FocusAppearance): string {
  return "outline=" + appearance.outline + "; boxShadow=" + appearance.boxShadow + "; border=" + appearance.border;
}

function formatAxeEvidence(violations: AxeViolationEvidence[]): string {
  if (violations.length === 0) {
    return "No serious or critical Axe violations found.";
  }

  return violations
    .map((violation) => {
      const targets = violation.targets.join(", ") || "document";
      return violation.id + " (" + (violation.impact ?? "unknown") + ") at " + targets + "; " + violation.helpUrl;
    })
    .join("\n");
}

async function collectFocusProbe(page: Page): Promise<{ focusVisible: boolean; evidence: string }> {
  const baselines = await page.evaluate(
    createPageCallback<string, FocusableBaseline[]>(FOCUS_BASELINE_SCRIPT),
    FOCUSABLE_SELECTOR,
  );

  if (baselines.length === 0) {
    return { focusVisible: true, evidence: "No keyboard-focusable interactive elements found." };
  }

  const invisibleElements: string[] = [];

  for (let index = 0; index < baselines.length; index += 1) {
    await page.keyboard.press("Tab");
    const currentFocus = await page.evaluate(createPageCallback<{
      selector: string;
      baselines: FocusableBaseline[];
    }, {
      index: number;
      before: FocusAppearance | undefined;
      after: FocusAppearance;
      tagName: string;
    } | null>(CURRENT_FOCUS_SCRIPT), {
      selector: FOCUSABLE_SELECTOR,
      baselines,
    });

    if (!currentFocus || !currentFocus.before) {
      invisibleElements.push("No focusable active element after Tab.");
      continue;
    }

    const focusChanged = currentFocus.before.outline !== currentFocus.after.outline
      || currentFocus.before.boxShadow !== currentFocus.after.boxShadow
      || currentFocus.before.border !== currentFocus.after.border;
    const hasVisibleOutline = !currentFocus.after.outline.startsWith("none ")
      && !currentFocus.after.outline.startsWith("hidden ")
      && !currentFocus.after.outline.includes(" 0px ");
    const hasVisibleBoxShadow = currentFocus.after.boxShadow !== "none";
    const hasVisibleBorderChange = currentFocus.before.border !== currentFocus.after.border;

    if (!focusChanged || !(hasVisibleOutline || hasVisibleBoxShadow || hasVisibleBorderChange)) {
      invisibleElements.push(currentFocus.tagName + "[" + currentFocus.index + "] (" + formatFocusAppearance(currentFocus.after) + ")");
    }
  }

  if (invisibleElements.length === 0) {
    return { focusVisible: true, evidence: "Visible focus confirmed for " + baselines.length + " interactive element(s)." };
  }

  return {
    focusVisible: false,
    evidence: "Focus-visible style did not change for: " + invisibleElements.join(", "),
  };
}

async function collectInfinitePrimaryAnimations(page: Page): Promise<string[]> {
  return page.evaluate(createPageExpression<string[]>(PRIMARY_ANIMATION_SCRIPT));
}

async function inspectViewport(page: Page, url: string, width: number): Promise<BrowserResponsiveProbe> {
  await page.setViewportSize({ width, height: viewportHeight(width) });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(createPageExpression<Promise<void>>(DOCUMENT_FONTS_READY_SCRIPT));

  const dimensions = await page.evaluate(createPageExpression<{
    scrollWidth: number;
    clientWidth: number;
  }>(DOCUMENT_DIMENSIONS_SCRIPT));
  const focus = await collectFocusProbe(page);
  const infinitePrimaryAnimations = await collectInfinitePrimaryAnimations(page);

  return {
    width,
    ...dimensions,
    focusVisible: focus.focusVisible,
    focusEvidence: focus.evidence,
    infinitePrimaryAnimations,
  };
}

export async function runPlaywrightBrowserScript(input: BrowserScriptInput): Promise<BrowserScriptResult> {
  const browser = await chromium.launch({ headless: true });
  const runtimeErrors: string[] = [];

  try {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") {
          runtimeErrors.push("console.error: " + message.text());
        }
      });
      page.on("pageerror", (error) => {
        runtimeErrors.push("pageerror: " + error.message);
      });

      await page.emulateMedia({ reducedMotion: "reduce" });
      const widths = [...REQUIRED_VIEWPORT_WIDTHS, input.desktopWidth];
      const responsive: BrowserResponsiveProbe[] = [];

      for (const width of widths) {
        responsive.push(await inspectViewport(page, input.url, width));
      }

      const axe = await new AxeBuilder({ page }).analyze();
      const axeViolations = axe.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact ?? null,
          helpUrl: violation.helpUrl,
          targets: violation.nodes.flatMap((node) => node.target.map((target) => (
            Array.isArray(target) ? target.join(" ") : String(target)
          ))),
        }));

      return { runtimeErrors, responsive, axeViolations };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

export const playwrightBrowserRunner: BrowserScriptRunner = {
  run: runPlaywrightBrowserScript,
};

export function formatAccessibilityEvidence(violations: AxeViolationEvidence[]): string {
  return formatAxeEvidence(violations);
}
