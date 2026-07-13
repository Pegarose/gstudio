import assert from "node:assert/strict";
import test from "node:test";
import { E2BProvider } from "../../lib/sandbox/providers/e2b-provider";
import { createSandboxService } from "../../lib/sandbox/service/sandbox-service";

function createFakeRegistry(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles));
  const commands: string[] = [];
  const reads: string[] = [];
  const writes: string[] = [];
  let connectCount = 0;

  const provider = {
    files,
    commands,
    reads,
    writes,
    async readFile(path: string) {
      reads.push(path);
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return content;
    },
    async writeFile(path: string, content: string) {
      writes.push(path);
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
      connect: async () => {
        connectCount += 1;
        return provider;
      },
    },
    get connectCount() {
      return connectCount;
    },
  };
}

test("snapshot and restore rewrite an existing file and remove a newly created file", async () => {
  const fake = createFakeRegistry({ "src/App.tsx": "before" });
  const service = createSandboxService({ providers: fake.registry as never, leases: {} as never });

  const snapshot = await service.snapshotFiles("sandbox-1", ["src/App.tsx", "src/New.tsx"]);
  assert.deepEqual(snapshot, [
    { path: "src/App.tsx", content: "before" },
    { path: "src/New.tsx", content: null },
  ]);
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

test("service turns an E2B missing-file result into a null snapshot and removes the later file", async () => {
  const files = new Map<string, string>();
  const provider = new E2BProvider({ e2b: { apiKey: "test-key" } });
  Object.assign(provider as unknown as Record<string, unknown>, {
    sandbox: {
      runCode: async () => ({
        logs: { stdout: [], stderr: [] },
        error: {
          name: "FileNotFoundError",
          value: "[Errno 2] No such file or directory",
        },
      }),
      files: {
        write: async (fullPath: string, content: Buffer) => {
          files.set(fullPath.replace("/home/user/app/", ""), content.toString());
        },
      },
      commands: {
        run: async (command: string) => {
          const match = /^rm -f -- (.+)$/.exec(command);
          if (match) {
            files.delete(match[1]);
          }
          return { stdout: "", stderr: "", exitCode: 0 };
        },
      },
    },
  });
  const service = createSandboxService({
    providers: { connect: async () => provider } as never,
    leases: {} as never,
  });

  const snapshot = await service.snapshotFiles("sandbox-1", ["src/New.tsx"]);
  assert.deepEqual(snapshot, [{ path: "src/New.tsx", content: null }]);

  await service.writeFiles("sandbox-1", [{ path: "src/New.tsx", content: "new" }]);
  await service.restoreFiles("sandbox-1", snapshot);

  assert.equal(files.has("src/New.tsx"), false);
});

test("snapshot validates the full path list before resolving or reading a provider", async () => {
  const fake = createFakeRegistry({ "src/App.tsx": "before" });
  const service = createSandboxService({ providers: fake.registry as never, leases: {} as never });

  await assert.rejects(
    () => service.snapshotFiles("sandbox-1", ["src/App.tsx", "package.json"]),
    /unsafe sandbox snapshot path/i,
  );

  assert.equal(fake.connectCount, 0);
  assert.deepEqual(fake.provider.reads, []);
  assert.deepEqual(fake.provider.writes, []);
  assert.deepEqual(fake.provider.commands, []);
});

test("restore validates the full snapshot list before resolving or mutating a provider", async () => {
  const fake = createFakeRegistry();
  const service = createSandboxService({ providers: fake.registry as never, leases: {} as never });

  await assert.rejects(
    () => service.restoreFiles("sandbox-1", [
      { path: "src/App.tsx", content: "before" },
      { path: "package.json", content: null },
    ]),
    /unsafe sandbox snapshot path/i,
  );

  assert.equal(fake.connectCount, 0);
  assert.deepEqual(fake.provider.reads, []);
  assert.deepEqual(fake.provider.writes, []);
  assert.deepEqual(fake.provider.commands, []);
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
