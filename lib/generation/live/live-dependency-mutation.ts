import type { CommandResult, SandboxProvider } from "../../sandbox/types";
import { validateDependencies } from "../validation/dependency-validator";

const PACKAGE_STATE_PATHS = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
] as const;

const ABSENT_FILE_ERROR = /\bENOENT\b|no such file or directory|FileNotFoundError/i;

type PackageStatePath = (typeof PACKAGE_STATE_PATHS)[number];

interface PackageStateSnapshot {
  path: PackageStatePath;
  content: string | null;
}

export interface LiveDependencyMutation {
  install(packages: readonly string[]): Promise<{
    installed: string[];
    alreadyInstalled: string[];
    result: CommandResult | null;
  }>;
  rollback(): Promise<void>;
}

/**
 * Keeps package installation inside the same provider-scoped transaction as a
 * candidate write. It owns only package metadata and direct dependency state;
 * file rollback remains the responsibility of live validation activation.
 */
export function createLiveDependencyMutation(input: {
  provider: Pick<SandboxProvider, "readFile" | "writeFile" | "runCommand" | "installPackages">;
}): LiveDependencyMutation {
  let state: { snapshots: PackageStateSnapshot[]; knownPackages: Set<string> } | undefined;
  const attemptedPackages = new Set<string>();
  let rollbackPromise: Promise<void> | undefined;

  async function ensureState() {
    if (state) return state;

    const snapshots = await Promise.all(PACKAGE_STATE_PATHS.map(async (path) => ({
      path,
      content: await readOptionalFile(input.provider, path),
    })));
    state = {
      snapshots,
      knownPackages: packageNamesFromManifest(snapshots.find((snapshot) => snapshot.path === "package.json")?.content ?? null),
    };
    return state;
  }

  return {
    async install(packages) {
      const requested = validateDependencies(packages).missingPackages;
      if (requested.length === 0) {
        return { installed: [], alreadyInstalled: [], result: null };
      }

      const current = await ensureState();
      const alreadyInstalled = requested.filter((packageName) => current.knownPackages.has(packageName));
      const missing = requested.filter((packageName) => !current.knownPackages.has(packageName));
      if (missing.length === 0) {
        return { installed: [], alreadyInstalled, result: null };
      }

      for (const packageName of missing) attemptedPackages.add(packageName);
      const result = await input.provider.installPackages(missing);
      if (!result.success) {
        throw new Error(`The sandbox could not install candidate dependencies: ${missing.join(", ")}`);
      }

      for (const packageName of missing) current.knownPackages.add(packageName);
      return { installed: missing, alreadyInstalled, result };
    },

    async rollback() {
      if (!state) return;
      rollbackPromise ??= rollbackDependencyMutation(input.provider, state.snapshots, [...attemptedPackages]);
      await rollbackPromise;
    },
  };
}

async function readOptionalFile(
  provider: Pick<SandboxProvider, "readFile">,
  path: PackageStatePath,
): Promise<string | null> {
  try {
    return await provider.readFile(path);
  } catch (error) {
    if (error instanceof Error && ABSENT_FILE_ERROR.test(error.message)) return null;
    throw error;
  }
}

function packageNamesFromManifest(content: string | null): Set<string> {
  if (content === null) return new Set();

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Unable to parse sandbox package.json before dependency installation: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Unable to parse sandbox package.json before dependency installation.");
  }

  const manifest = parsed as Record<string, unknown>;
  const names = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
  ].flatMap((dependencies) => (
    dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)
      ? Object.keys(dependencies)
      : []
  ));
  return new Set(validateDependencies(names).declaredPackages);
}

async function rollbackDependencyMutation(
  provider: Pick<SandboxProvider, "writeFile" | "runCommand">,
  snapshots: PackageStateSnapshot[],
  attemptedPackages: string[],
): Promise<void> {
  const failures: string[] = [];

  if (attemptedPackages.length > 0) {
    const result = await provider.runCommand(`npm uninstall --no-save -- ${attemptedPackages.join(" ")}`);
    if (!result.success) {
      failures.push("unable to uninstall candidate dependencies");
    }
  }

  for (const snapshot of snapshots) {
    try {
      if (snapshot.content === null) {
        const result = await provider.runCommand(`rm -f -- ${snapshot.path}`);
        if (!result.success) {
          throw new Error("remove command failed");
        }
      } else {
        await provider.writeFile(snapshot.path, snapshot.content);
      }
    } catch (error) {
      failures.push(`unable to restore ${snapshot.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Dependency rollback failed: ${failures.join("; ")}`);
  }
}
