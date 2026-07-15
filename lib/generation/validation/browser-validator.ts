import type { CheckResult, ResponsiveCheckResult, ValidationFailureClass } from "../contracts/validation";
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
  failureClass?: ValidationFailureClass;
  failureEvidence?: string;
}

const TRANSIENT_PAGE_EVALUATE_ERROR = /page\.evaluate:\s*(?:referenceerror|syntaxerror|typeerror)\b/i;
const BROWSER_RETRY_DELAY_MS = 250;

function buildRuntimeCheck(runtimeErrors: string[]): CheckResult {
  return {
    passed: runtimeErrors.length === 0,
    evidence: runtimeErrors.length === 0
      ? "No console errors or page errors recorded."
      : runtimeErrors.join("\n"),
  };
}

export async function validateBrowser({ runner = playwrightBrowserRunner, ...input }: BrowserValidationInput): Promise<BrowserValidationReport> {
  let result;
  try {
    result = await runBrowserWithTransientRetry(runner, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureClass: ValidationFailureClass = /executable|chromium|playwright|browser validation worker/i.test(message)
      ? "sandbox-infrastructure"
      : "runtime";
    return infrastructureFailureReport(error, failureClass);
  }
  if (result.failureClass) {
    return infrastructureFailureReport(result.failureEvidence ?? "Browser validation infrastructure is unavailable.", result.failureClass);
  }
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

async function runBrowserWithTransientRetry(
  runner: BrowserScriptRunner,
  input: BrowserScriptInput,
) {
  try {
    return await runner.run(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!TRANSIENT_PAGE_EVALUATE_ERROR.test(message)) throw error;
    await new Promise((resolve) => setTimeout(resolve, BROWSER_RETRY_DELAY_MS));
    return runner.run(input);
  }
}

function infrastructureFailureReport(
  error: unknown,
  failureClass: ValidationFailureClass = "sandbox-infrastructure",
): BrowserValidationReport {
  const rawMessage = typeof error === "string"
    ? error
    : error instanceof Error ? error.message : "Browser validation infrastructure is unavailable.";
  const evidence = /executable|chromium|playwright/i.test(rawMessage)
    ? "Chromium executable is unavailable in the web validation environment. Rebuild the web image with the Playwright browser cache, then retry sandbox validation."
    : `Browser validation could not inspect the sandbox preview: ${rawMessage.slice(0, 240)}`;
  const failed = { passed: false, evidence };
  return {
    runtime: failed,
    responsive: [],
    keyboard: failed,
    reducedMotion: failed,
    accessibility: failed,
    passed: false,
    failureClass,
    failureEvidence: evidence,
  };
}
