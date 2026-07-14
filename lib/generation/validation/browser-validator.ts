import type { CheckResult, ResponsiveCheckResult } from "../contracts/validation";
import {
  formatAccessibilityEvidence,
  playwrightBrowserRunner,
  type BrowserScriptInput,
  type BrowserScriptRunner,
} from "./browser-script";

export interface BrowserValidationInput extends BrowserScriptInput {
  runner?: BrowserScriptRunner;
}

export interface BrowserValidationReport {
  runtime: CheckResult;
  responsive: ResponsiveCheckResult[];
  keyboard: CheckResult;
  reducedMotion: CheckResult;
  accessibility: CheckResult;
  passed: boolean;
}

function buildRuntimeCheck(runtimeErrors: string[]): CheckResult {
  return {
    passed: runtimeErrors.length === 0,
    evidence: runtimeErrors.length === 0
      ? "No console errors or page errors recorded."
      : runtimeErrors.join("\n"),
  };
}

export async function validateBrowser({ runner = playwrightBrowserRunner, ...input }: BrowserValidationInput): Promise<BrowserValidationReport> {
  const result = await runner.run(input);
  const runtime = buildRuntimeCheck(result.runtimeErrors);
  const responsive = result.responsive.map((probe) => ({
    width: probe.width,
    horizontalOverflow: probe.scrollWidth > probe.clientWidth,
    passed: probe.scrollWidth <= probe.clientWidth,
    evidence: `scrollWidth=${probe.scrollWidth}; clientWidth=${probe.clientWidth}`,
  }));
  const keyboardFailures = result.responsive.filter((probe) => !probe.focusVisible);
  const keyboard: CheckResult = {
    passed: keyboardFailures.length === 0,
    evidence: keyboardFailures.length === 0
      ? "Visible keyboard focus confirmed at every required viewport."
      : keyboardFailures.map((probe) => `${probe.width}px: ${probe.focusEvidence}`).join("\n"),
  };
  const motionFailures = result.responsive.filter((probe) => probe.infinitePrimaryAnimations.length > 0);
  const reducedMotion: CheckResult = {
    passed: motionFailures.length === 0,
    evidence: motionFailures.length === 0
      ? "No infinite primary-content animations remain with reduced motion enabled."
      : motionFailures
        .map((probe) => `${probe.width}px: ${probe.infinitePrimaryAnimations.join(", ")}`)
        .join("\n"),
  };
  const accessibility: CheckResult = {
    passed: result.axeViolations.length === 0,
    evidence: formatAccessibilityEvidence(result.axeViolations),
  };

  return {
    runtime,
    responsive,
    keyboard,
    reducedMotion,
    accessibility,
    passed: runtime.passed
      && responsive.every((check) => check.passed)
      && keyboard.passed
      && reducedMotion.passed
      && accessibility.passed,
  };
}
