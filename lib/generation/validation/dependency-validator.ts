import ts from "typescript";
import {
  GenerationArtifactSchema,
  type GenerationArtifact,
  type ValidationFile,
} from "../contracts/validation";

export const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i;

export interface TemplatePackageJson {
  dependencies?: Readonly<Record<string, unknown>>;
  devDependencies?: Readonly<Record<string, unknown>>;
  peerDependencies?: Readonly<Record<string, unknown>>;
  optionalDependencies?: Readonly<Record<string, unknown>>;
}

export type TemplateDependencies = readonly string[] | Readonly<Record<string, unknown>>;

export interface DependencyValidationInput {
  artifact: GenerationArtifact;
  templatePackageJson?: TemplatePackageJson;
  templateDependencies?: TemplateDependencies;
}

export interface DependencyValidationResult {
  artifactPackages: string[];
  templatePackages: string[];
  declaredPackages: string[];
  imports: string[];
  missingPackages: string[];
}

/**
 * Finds every direct npm package referenced by a generated artifact before a
 * sandbox is allowed to install or write it. Unlike the legacy response parser,
 * this includes TypeScript AST dynamic imports and re-exports.
 */
export function inferArtifactPackageNames(input: GenerationArtifact): string[] {
  const artifact = GenerationArtifactSchema.parse(input);
  return uniqueValidatedPackageNames([
    ...artifact.packages,
    ...extractBareImports(artifact.files),
  ]);
}

export function validateDependencies(packages: readonly string[]): DependencyValidationResult;
export function validateDependencies(input: DependencyValidationInput): DependencyValidationResult;
export function validateDependencies(
  input: readonly string[] | DependencyValidationInput,
): DependencyValidationResult {
  if (isPackageList(input)) {
    const artifactPackages = uniqueValidatedPackageNames(input);
    return {
      artifactPackages,
      templatePackages: [],
      declaredPackages: artifactPackages,
      imports: [],
      missingPackages: artifactPackages,
    };
  }

  const artifact = GenerationArtifactSchema.parse(input.artifact);
  const artifactPackages = uniqueValidatedPackageNames(artifact.packages);
  const templatePackages = uniqueValidatedPackageNames([
    ...packageNamesFromTemplatePackageJson(input.templatePackageJson),
    ...packageNamesFromSuppliedDependencies(input.templateDependencies),
  ]);
  const declaredPackages = unique([...artifactPackages, ...templatePackages]);
  const imports = extractBareImports(artifact.files);
  const undeclaredImports = imports.filter((packageName) => !declaredPackages.includes(packageName));

  if (undeclaredImports.length > 0) {
    throw new Error(`Undeclared package imports: ${undeclaredImports.join(", ")}`);
  }

  return {
    artifactPackages,
    templatePackages,
    declaredPackages,
    imports,
    missingPackages: artifactPackages.filter((packageName) => !templatePackages.includes(packageName)),
  };
}

function packageNamesFromTemplatePackageJson(template: TemplatePackageJson | undefined): string[] {
  if (!template) return [];

  return [
    template.dependencies,
    template.devDependencies,
    template.peerDependencies,
    template.optionalDependencies,
  ].flatMap((dependencies) => dependencies ? Object.keys(dependencies) : []);
}

function packageNamesFromSuppliedDependencies(dependencies: TemplateDependencies | undefined): string[] {
  if (!dependencies) return [];
  return Array.isArray(dependencies) ? [...dependencies] : Object.keys(dependencies);
}

function uniqueValidatedPackageNames(packages: readonly string[]): string[] {
  return unique(packages.map((packageName) => {
    if (!PACKAGE_NAME.test(packageName)) {
      throw new Error(`Invalid npm registry package: ${packageName}`);
    }
    return packageName;
  }));
}

function extractBareImports(files: readonly ValidationFile[]): string[] {
  const imports: string[] = [];

  for (const file of files) {
    if (!isCodeFile(file.path)) continue;

    const sourceFile = ts.createSourceFile(
      file.path,
      file.content,
      ts.ScriptTarget.Latest,
      false,
      scriptKindForPath(file.path),
    );

    const visit = (node: ts.Node): void => {
      const moduleSpecifier = moduleSpecifierFor(node);
      if (moduleSpecifier) {
        const packageName = packageNameForImport(moduleSpecifier);
        if (packageName) {
          if (!PACKAGE_NAME.test(packageName)) {
            throw new Error(`Invalid npm registry package: ${packageName}`);
          }
          imports.push(packageName);
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return unique(imports);
}

function moduleSpecifierFor(node: ts.Node): string | null {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    && node.moduleSpecifier
    && ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }

  if (
    ts.isImportEqualsDeclaration(node)
    && ts.isExternalModuleReference(node.moduleReference)
    && node.moduleReference.expression
    && ts.isStringLiteral(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }

  if (
    ts.isCallExpression(node)
    && node.expression.kind === ts.SyntaxKind.ImportKeyword
    && node.arguments.length === 1
    && ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }

  return null;
}

function packageNameForImport(moduleSpecifier: string): string | null {
  if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) return null;
  const segments = moduleSpecifier.split("/");
  return moduleSpecifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
}

function isCodeFile(path: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/i.test(path);
}

function scriptKindForPath(path: string): ts.ScriptKind {
  if (/\.[cm]?tsx$/i.test(path)) return ts.ScriptKind.TSX;
  if (/\.[cm]?jsx$/i.test(path)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isPackageList(
  input: readonly string[] | DependencyValidationInput,
): input is readonly string[] {
  return Array.isArray(input);
}
