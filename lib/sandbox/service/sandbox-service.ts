import {
  getSandboxLease,
  markSandboxLeaseState,
  upsertSandboxLease,
  type SandboxLease,
} from "../lease-repository";
import type { CommandResult, SandboxFile, SandboxInfo, SandboxProvider } from "../types";
import type {
  CommandSpec,
  ReadinessResult,
  ReadinessTarget,
  SandboxService,
} from "./contracts";
import { ProviderRegistry, type SandboxProviderRegistry } from "./provider-registry";

type SandboxLeaseRepository = {
  getSandboxLease?: (sandboxId: string) => Promise<SandboxLease | null>;
  upsertSandboxLease?: typeof upsertSandboxLease;
  markSandboxLeaseState?: typeof markSandboxLeaseState;
};

export interface CreateSandboxServiceDependencies {
  providers?: SandboxProviderRegistry;
  leases?: SandboxLeaseRepository;
  fetch?: typeof globalThis.fetch;
}

const defaultLeases: Required<SandboxLeaseRepository> = {
  getSandboxLease,
  upsertSandboxLease,
  markSandboxLeaseState,
};

export function createSandboxService(
  dependencies: CreateSandboxServiceDependencies = {},
): SandboxService {
  const providers = dependencies.providers ?? new ProviderRegistry();
  const leases = dependencies.leases ?? defaultLeases;
  const request = dependencies.fetch ?? globalThis.fetch;

  async function leaseFor(sandboxId: string): Promise<SandboxLease | null> {
    return leases.getSandboxLease?.(sandboxId) ?? null;
  }

  async function resolve(sandboxId: string): Promise<SandboxProvider> {
    const lease = await leaseFor(sandboxId);
    const provider = await providers.connect(sandboxId, lease?.provider as "e2b" | "vercel" | undefined);
    if (lease) {
      await leases.markSandboxLeaseState?.(sandboxId, lease.state);
    }
    return provider;
  }

  return {
    async allocate(input) {
      const info = await providers.allocate(input.provider);
      await leases.upsertSandboxLease?.({
        sandboxId: info.sandboxId,
        projectId: input.projectId,
        generationId: input.generationId,
        provider: info.provider,
        state: "allocated",
        url: info.url,
        metadata: {},
        expiresAt: null,
      });
      return info;
    },

    async connect(sandboxId) {
      const provider = await resolve(sandboxId);
      const info = provider.getSandboxInfo();
      if (!info) {
        throw new Error(`Sandbox ${sandboxId} is connected but has no sandbox info`);
      }
      return info;
    },

    async setupViteApp(sandboxId) {
      await (await resolve(sandboxId)).setupViteApp();
    },

    async writeFiles(sandboxId, files) {
      const provider = await resolve(sandboxId);
      for (const file of files) {
        await provider.writeFile(file.path, file.content);
      }
    },

    async installPackages(sandboxId, packages) {
      return (await resolve(sandboxId)).installPackages(packages);
    },

    async startDevServer(sandboxId) {
      await (await resolve(sandboxId)).restartViteServer();
    },

    async waitUntilReady(sandboxId, target) {
      await resolve(sandboxId);
      const deadline = Date.now() + target.timeoutMs;
      let attempts = 0;
      let lastError: string | null = null;

      while (Date.now() <= deadline) {
        attempts += 1;
        try {
          const response = await request(target.url);
          if (response.ok) {
            return { ready: true, attempts, lastError: null };
          }
          lastError = `HTTP ${response.status}`;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }

        if (Date.now() <= deadline) {
          await new Promise((resolveTimeout) => setTimeout(resolveTimeout, target.intervalMs));
        }
      }

      return { ready: false, attempts, lastError };
    },

    async runCommand(sandboxId, spec: CommandSpec): Promise<CommandResult> {
      const command = spec.background ? `nohup ${spec.command} > /tmp/sandbox-command.log 2>&1 &` : spec.command;
      return (await resolve(sandboxId)).runCommand(command);
    },

    async pause(sandboxId) {
      const provider = await resolve(sandboxId);
      await provider.pause();
      await leases.markSandboxLeaseState?.(sandboxId, "paused");
    },

    async terminate(sandboxId) {
      const provider = await resolve(sandboxId);
      await provider.terminate();
      await leases.markSandboxLeaseState?.(sandboxId, "terminated");
    },
  };
}
