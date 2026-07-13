import type { CommandResult } from "../../sandbox/types";
import type { SandboxService } from "../../sandbox/service/contracts";
import {
  GenerationArtifactSchema,
  type GenerationArtifact,
} from "../contracts/validation";
import {
  validateDependencies,
  type DependencyValidationResult,
  type TemplateDependencies,
  type TemplatePackageJson,
} from "../validation/dependency-validator";
import {
  validateSandboxBuild,
  type SandboxBuildResult,
} from "../validation/build-validator";

export interface ArtifactApplyInput {
  sandboxId: string;
  artifact: GenerationArtifact;
  templatePackageJson?: TemplatePackageJson;
  templateDependencies?: TemplateDependencies;
}

export interface ArtifactApplyResult {
  passed: boolean;
  dependencies: DependencyValidationResult;
  install: CommandResult | null;
  build: SandboxBuildResult;
}

export async function applyArtifact(
  input: ArtifactApplyInput,
  sandbox: Pick<SandboxService, "writeFiles" | "installPackages" | "runCommand">,
): Promise<ArtifactApplyResult> {
  const artifact = GenerationArtifactSchema.parse(input.artifact);
  const dependencies = validateDependencies({
    artifact,
    templatePackageJson: input.templatePackageJson,
    templateDependencies: input.templateDependencies,
  });

  await sandbox.writeFiles(input.sandboxId, artifact.files);

  const install = dependencies.missingPackages.length > 0
    ? await sandbox.installPackages(input.sandboxId, dependencies.missingPackages)
    : null;
  const build = await validateSandboxBuild(input.sandboxId, sandbox);

  return {
    passed: (install?.success ?? true) && build.passed,
    dependencies,
    install,
    build,
  };
}
