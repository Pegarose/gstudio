import type { CommandResult, SandboxFile, SandboxInfo } from "../types";

export interface CommandSpec {
  command: string;
  background?: boolean;
}

export interface ReadinessTarget {
  url: string;
  timeoutMs: number;
  intervalMs: number;
}

export interface ReadinessResult {
  ready: boolean;
  attempts: number;
  lastError: string | null;
}

export interface SandboxService {
  allocate(input: {
    projectId: string;
    generationId: string | null;
    provider: "e2b" | "vercel";
  }): Promise<SandboxInfo>;
  connect(sandboxId: string): Promise<SandboxInfo>;
  writeFiles(sandboxId: string, files: SandboxFile[]): Promise<void>;
  installPackages(sandboxId: string, packages: string[]): Promise<CommandResult>;
  startDevServer(sandboxId: string): Promise<void>;
  waitUntilReady(sandboxId: string, target: ReadinessTarget): Promise<ReadinessResult>;
  runCommand(sandboxId: string, spec: CommandSpec): Promise<CommandResult>;
  pause(sandboxId: string): Promise<void>;
  terminate(sandboxId: string): Promise<void>;
}
