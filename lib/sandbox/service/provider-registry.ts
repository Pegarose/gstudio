import { SandboxFactory } from "../factory";
import type { SandboxInfo, SandboxProvider } from "../types";

export interface SandboxProviderRegistry {
  allocate(provider: "e2b" | "vercel"): Promise<SandboxInfo>;
  connect(sandboxId: string, provider?: "e2b" | "vercel"): Promise<SandboxProvider>;
}

type SandboxProviderFactory = (provider: "e2b" | "vercel") => SandboxProvider;

export class ProviderRegistry implements SandboxProviderRegistry {
  private readonly providers = new Map<string, SandboxProvider>();

  constructor(private readonly createProvider: SandboxProviderFactory = SandboxFactory.create) {}

  async allocate(providerName: "e2b" | "vercel"): Promise<SandboxInfo> {
    const provider = this.createProvider(providerName);
    const info = await provider.createSandbox();
    this.providers.set(info.sandboxId, provider);
    return info;
  }

  async connect(sandboxId: string, providerName?: "e2b" | "vercel"): Promise<SandboxProvider> {
    const existing = this.providers.get(sandboxId);
    if (existing) {
      return existing;
    }

    if (!providerName) {
      throw new Error(`Sandbox ${sandboxId} has no registered provider`);
    }

    const provider = this.createProvider(providerName);
    const reconnect = (provider as SandboxProvider & { reconnect?: (id: string) => Promise<boolean> }).reconnect;
    if (!reconnect || !(await reconnect.call(provider, sandboxId))) {
      throw new Error(`Unable to connect to sandbox ${sandboxId}`);
    }

    this.providers.set(sandboxId, provider);
    return provider;
  }
}
