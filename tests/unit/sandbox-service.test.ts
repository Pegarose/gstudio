import assert from "node:assert/strict";
import test from "node:test";
import { createSandboxService } from "../../lib/sandbox/service/sandbox-service";

test("sandbox operations resolve the requested sandbox instead of an active singleton", async () => {
  const calls: string[] = [];
  const providers = {
    connect: async (id: string) => ({
      runCommand: async (command: string) => {
        calls.push(`${id}:${command}`);
        return { stdout: id, stderr: "", exitCode: 0, success: true };
      },
    }),
  };
  const service = createSandboxService({ providers: providers as never, leases: {} as never });
  await service.runCommand("sandbox-a", { command: "pwd" });
  await service.runCommand("sandbox-b", { command: "pwd" });
  assert.deepEqual(calls, ["sandbox-a:pwd", "sandbox-b:pwd"]);
});
