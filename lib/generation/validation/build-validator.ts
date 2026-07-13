import type { SandboxService } from "../../sandbox/service/contracts";

export const BUILD_TIMEOUT_MS = 120_000;

export interface SandboxBuildResult {
  passed: boolean;
  evidence: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export async function validateSandboxBuild(
  sandboxId: string,
  sandbox: Pick<SandboxService, "runCommand">,
): Promise<SandboxBuildResult> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(null), BUILD_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      sandbox.runCommand(sandboxId, { command: "npm run build" }),
      timeout,
    ]);

    if (result === null) {
      return {
        passed: false,
        evidence: `npm run build timed out after ${BUILD_TIMEOUT_MS}ms.`,
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: true,
      };
    }

    return {
      passed: result.success && result.exitCode === 0,
      evidence: [
        `exit code: ${result.exitCode}`,
        "stdout:",
        result.stdout,
        "stderr:",
        result.stderr,
      ].join("\n"),
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: false,
    };
  } catch (error) {
    const evidence = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      evidence,
      stdout: "",
      stderr: evidence,
      exitCode: null,
      timedOut: false,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
