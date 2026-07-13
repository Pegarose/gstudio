import assert from "node:assert/strict";
import test from "node:test";
import type { CommandResult } from "../../lib/sandbox/types";
import type { CommandSpec, SandboxService } from "../../lib/sandbox/service/contracts";
import { applyArtifact } from "../../lib/generation/artifact/artifact-applier";
import {
  BUILD_TIMEOUT_MS,
  validateSandboxBuild,
} from "../../lib/generation/validation/build-validator";

function fakeBuildSandbox(
  commandResult: CommandResult,
  calls: Array<{ sandboxId: string; spec: CommandSpec }>,
): Pick<SandboxService, "runCommand"> {
  return {
    runCommand: async (sandboxId, spec) => {
      calls.push({ sandboxId, spec });
      return commandResult;
    },
  };
}

test("build validation preserves exact stderr evidence", async () => {
  const stderr = "src/App.tsx(4,1): error TS1005";
  const stdout = "building app";
  const calls: Array<{ sandboxId: string; spec: CommandSpec }> = [];
  const result = await validateSandboxBuild(
    "sandbox-1",
    fakeBuildSandbox({ exitCode: 1, stderr, stdout, success: false }, calls),
  );

  assert.equal(result.passed, false);
  assert.equal(result.stdout, stdout);
  assert.equal(result.stderr, stderr);
  assert.equal(result.exitCode, 1);
  assert.match(result.evidence, /TS1005/);
  assert.deepEqual(calls, [{ sandboxId: "sandbox-1", spec: { command: "npm run build" } }]);
});

test("build validation defines a 120-second timeout contract", () => {
  assert.equal(BUILD_TIMEOUT_MS, 120_000);
});

test("artifact applier writes validated files, installs missing packages once, then builds", async () => {
  const calls: string[] = [];
  const sandbox: Pick<SandboxService, "writeFiles" | "installPackages" | "runCommand"> = {
    writeFiles: async (sandboxId, files) => {
      calls.push(`write:${sandboxId}:${files.map((file) => file.path).join(",")}`);
    },
    installPackages: async (sandboxId, packages) => {
      calls.push(`install:${sandboxId}:${packages.join(",")}`);
      return { exitCode: 0, stdout: "installed", stderr: "", success: true };
    },
    runCommand: async (sandboxId, spec) => {
      calls.push(`build:${sandboxId}:${spec.command}`);
      return { exitCode: 0, stdout: "built", stderr: "", success: true };
    },
  };

  const result = await applyArtifact({
    sandboxId: "sandbox-2",
    artifact: {
      packages: ["lucide-react"],
      files: [{
        path: "src/App.tsx",
        content: "import { Sparkles } from 'lucide-react'; export const App = Sparkles;",
      }],
    },
    templatePackageJson: { dependencies: { react: "19.1.0" } },
  }, sandbox);

  assert.equal(result.passed, true);
  assert.deepEqual(result.dependencies.missingPackages, ["lucide-react"]);
  assert.equal(result.install?.success, true);
  assert.equal(result.build.passed, true);
  assert.deepEqual(calls, [
    "write:sandbox-2:src/App.tsx",
    "install:sandbox-2:lucide-react",
    "build:sandbox-2:npm run build",
  ]);
});
