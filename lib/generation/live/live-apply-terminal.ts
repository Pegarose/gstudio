import { posix as posixPath } from "node:path";

import type { SandboxProvider } from "../../sandbox/types";
import type { LiveActivationResult } from "./live-validation-activation";

const SAFE_CANDIDATE_PATH = /^(?:src|public)\/[A-Za-z0-9][A-Za-z0-9._/-]*$|^index\.html$/;

export interface LiveApplyTerminalEvent {
  type: "validation-report" | "rollback-started" | "rollback-complete" | "error";
  report?: LiveActivationResult["report"];
  status?: LiveActivationResult["status"];
  rolledBack?: boolean;
  message?: string;
  error?: string;
}

interface LegacySandboxFileCacheEntry {
  content: string;
  lastModified: number;
}

interface LegacySandboxState {
  fileCache?: {
    files: Record<string, LegacySandboxFileCacheEntry>;
  } | null;
}

interface LegacyCandidatePathSnapshot {
  path: string;
  hadCacheEntry: boolean;
  cacheEntry?: LegacySandboxFileCacheEntry;
  wasTracked: boolean;
}

/**
 * Lets activation snapshot before the route mutates files, while preserving a
 * rejection path for every provider write failure. The route must call either
 * `complete` or `fail` after `waitUntilStarted` resolves.
 */
export function createLiveCandidateMutationBarrier() {
  let beginMutation: (() => void) | undefined;
  let rejectStart: ((reason?: unknown) => void) | undefined;
  let resolveMutation: (() => void) | undefined;
  let rejectMutation: ((reason?: unknown) => void) | undefined;
  let mutationStarted = false;
  const started = new Promise<void>((resolve, reject) => {
    beginMutation = resolve;
    rejectStart = reject;
  });
  const completed = new Promise<void>((resolve, reject) => {
    resolveMutation = resolve;
    rejectMutation = reject;
  });

  return {
    applyCandidate: async () => {
      mutationStarted = true;
      beginMutation?.();
      await completed;
    },
    waitUntilStarted: () => started,
    complete: () => resolveMutation?.(),
    fail: (reason: unknown) => {
      rejectStart?.(reason);
      if (mutationStarted) {
        rejectMutation?.(reason);
      }
    },
  };
}

/**
 * The legacy apply route still mirrors writes into process-local cache and
 * file-tracking globals. Keep that compatibility state in lockstep with the
 * sandbox rollback boundary without widening validation state or touching
 * unrelated files.
 */
export function snapshotLegacyCandidateMutationState(input: {
  sandboxState?: LegacySandboxState | null;
  existingFiles?: Set<string> | null;
  paths: readonly string[];
}) {
  const snapshots: LegacyCandidatePathSnapshot[] = [];
  const capturedPaths = new Set<string>();

  for (const candidatePath of input.paths) {
    const path = posixPath.normalize(candidatePath);
    if (!SAFE_CANDIDATE_PATH.test(path)) {
      throw new Error(`Unsafe live candidate path: ${candidatePath}`);
    }
    if (capturedPaths.has(path)) continue;
    capturedPaths.add(path);

    const files = input.sandboxState?.fileCache?.files;
    const hadCacheEntry = Boolean(files && Object.prototype.hasOwnProperty.call(files, path));
    snapshots.push({
      path,
      hadCacheEntry,
      cacheEntry: hadCacheEntry ? files?.[path] : undefined,
      wasTracked: input.existingFiles?.has(path) ?? false,
    });
  }

  return {
    recordWrite(path: string, content: string): void {
      const normalizedPath = posixPath.normalize(path);
      if (!capturedPaths.has(normalizedPath)) {
        throw new Error(`Live candidate path was not snapshotted: ${path}`);
      }
      const files = input.sandboxState?.fileCache?.files;
      if (files) {
        files[normalizedPath] = {
          content,
          lastModified: Date.now(),
        };
      }
      input.existingFiles?.add(normalizedPath);
    },

    restore(): void {
      const files = input.sandboxState?.fileCache?.files;
      for (const snapshot of snapshots) {
        if (files) {
          if (snapshot.hadCacheEntry) {
            files[snapshot.path] = snapshot.cacheEntry!;
          } else {
            delete files[snapshot.path];
          }
        }
        if (input.existingFiles) {
          if (snapshot.wasTracked) {
            input.existingFiles.add(snapshot.path);
          } else {
            input.existingFiles.delete(snapshot.path);
          }
        }
      }
    },
  };
}

/**
 * Writes a durable, already-validated candidate file through the provider used
 * by the live activation boundary. A rejection deliberately bubbles to
 * `applyCandidate`, which gives activation ownership of rollback and terminal
 * persistence instead of allowing the route to continue with a partial write.
 */
export async function writeLiveCandidateFile(input: {
  provider: Pick<SandboxProvider, "runCommand" | "writeFile">;
  path: string;
  content: string;
}): Promise<void> {
  const path = posixPath.normalize(input.path);
  if (!SAFE_CANDIDATE_PATH.test(path)) {
    throw new Error(`Unsafe live candidate path: ${input.path}`);
  }

  const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (directory) {
    const result = await input.provider.runCommand(`mkdir -p ${directory}`);
    if (!result.success) {
      throw new Error(`Unable to prepare live candidate directory: ${directory}`);
    }
  }

  await input.provider.writeFile(path, input.content);
}

/**
 * Keeps terminal apply SSE semantics in one place: the report is always sent,
 * but rollback/error replace completion for every failed activation.
 */
export async function emitLiveActivationTerminalEvents(input: {
  result: LiveActivationResult;
  send(event: LiveApplyTerminalEvent): Promise<void>;
  failureMessage: string;
}): Promise<boolean> {
  await input.send({
    type: "validation-report",
    report: input.result.report,
    status: input.result.status,
    message: input.result.status === "passed"
      ? "Deterministic validation passed."
      : input.failureMessage,
  });

  if (input.result.status === "passed") {
    return true;
  }

  await input.send({ type: "rollback-started", message: "Restoring the previous sandbox files..." });
  await input.send({
    type: "rollback-complete",
    rolledBack: input.result.rolledBack,
    message: input.result.rolledBack
      ? "Previous sandbox files restored."
      : "Rollback could not be confirmed.",
  });
  await input.send({
    type: "error",
    error: input.failureMessage,
    report: input.result.report,
  });
  return false;
}
