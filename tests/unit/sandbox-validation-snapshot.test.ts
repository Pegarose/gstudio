import assert from "node:assert/strict";
import test from "node:test";
import { createSandboxService } from "../../lib/sandbox/service/sandbox-service";

function createFakeRegistry(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles));
  const commands: string[] = [];

  const provider = {
    files,
    commands,
    async readFile(path: string) {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return content;
    },
    async writeFile(path: string, content: string) {
      files.set(path, content);
    },
    async runCommand(command: string) {
      commands.push(command);
      const match = /^rm -f -- (.+)$/.exec(command);
      if (match) {
        files.delete(match[1]);
      }
      return { stdout: "", stderr: "", exitCode: 0, success: true };
    },
  };

  return {
    provider,
    registry: {
      connect: async () => provider,
    },
  };
}

test("snapshot and restore rewrite an existing file and remove a newly created file", async () => {
  const fake = createFakeRegistry({ "src/App.tsx": "before" });
  const service = createSandboxService({ providers: fake.registry as never, leases: {} as never });

  const snapshot = await service.snapshotFiles("sandbox-1", ["src/App.tsx", "src/New.tsx"]);
  await service.writeFiles("sandbox-1", [
    { path: "src/App.tsx", content: "after" },
    { path: "src/New.tsx", content: "new" },
  ]);
  await service.restoreFiles("sandbox-1", snapshot);

  assert.equal(fake.provider.files.get("src/App.tsx"), "before");
  assert.equal(fake.provider.files.has("src/New.tsx"), false);
  assert.deepEqual(fake.provider.commands, ["rm -f -- src/New.tsx"]);
});

test("snapshot rejects a shell-unsafe or out-of-scope path", async () => {
  const fake = createFakeRegistry({ "src/App.tsx": "before" });
  const service = createSandboxService({ providers: fake.registry as never, leases: {} as never });

  await assert.rejects(
    () => service.snapshotFiles("sandbox-1", ["src/App.tsx; rm -rf /"]),
    /unsafe sandbox snapshot path/i,
  );
  await assert.rejects(
    () => service.snapshotFiles("sandbox-1", ["src/../package.json"]),
    /unsafe sandbox snapshot path/i,
  );
  await assert.rejects(
    () => service.snapshotFiles("sandbox-1", ["../../src/App.tsx"]),
    /unsafe sandbox snapshot path/i,
  );
});

test("snapshot rethrows provider read errors that do not mean the file is absent", async () => {
  const fake = createFakeRegistry({ "src/App.tsx": "before" });
  fake.provider.readFile = async () => {
    throw new Error("sandbox transport unavailable");
  };
  const service = createSandboxService({ providers: fake.registry as never, leases: {} as never });

  await assert.rejects(
    () => service.snapshotFiles("sandbox-1", ["src/App.tsx"]),
    /sandbox transport unavailable/i,
  );
});
