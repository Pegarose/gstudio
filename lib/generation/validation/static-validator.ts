import ts from "typescript";
import {
  DesignPlanSchema,
  GenerationArtifactSchema,
  ProductBriefSchema,
  type DesignPlan,
  type GenerationArtifact,
  type ProductBrief,
  type RuleViolation,
  type ValidationFile,
} from "../contracts/validation";
import type { StaticRuleCode } from "./rules";

export interface StaticValidationInput {
  files: ValidationFile[];
  packages?: GenerationArtifact["packages"];
  brief: ProductBrief;
  plan: DesignPlan;
}

interface SourceLocation {
  file: string;
  line: number;
}

interface InteractiveElement extends SourceLocation {
  hasFocusVisibleUtility: boolean;
}

interface PrimaryCta extends SourceLocation {}

const HEADING_TAG = /^h[1-6]$/i;
const INTERACTIVE_TAG = new Set(["button", "input", "select", "textarea"]);
const SEMANTIC_TEXT_BLOCK_TAGS = new Set(["p", "blockquote", "li", "figcaption", "label", "button", "a"]);
const ARBITRARY_COLOR_UTILITY = /(?:^|\s)(?:text|bg|border|from|to|via|fill|stroke|ring|outline|decoration|shadow|caret|accent)-\[(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|hwb)\()/i;
const ARBITRARY_FONT_UTILITY = /(?:^|\s)font-\[(?!var\()[^\]]+\]/i;
const NUMERIC_CLAIM = /\b\d+(?:[,.]\d+)*(?:\s*(?:%|x|customers?|teams?|users?|awards?))?\b/i;
const PROOF_CLAIM = /\btrusted by\b|\bcustomers?\b|\bawards?\b|["“][^"”]{12,}["”]/i;

export function validateStaticRules(input: StaticValidationInput): RuleViolation[] {
  const artifact = GenerationArtifactSchema.parse({
    files: input.files,
    packages: input.packages ?? [],
  });
  const brief = ProductBriefSchema.parse(input.brief);
  const plan = DesignPlanSchema.parse(input.plan);
  const violations: RuleViolation[] = [];
  const h1s: SourceLocation[] = [];
  const interactiveElements: InteractiveElement[] = [];
  const primaryCtas: PrimaryCta[] = [];
  const visibleText: Array<{ value: string; location: SourceLocation }> = [];
  const imports: Array<{ packageName: string; location: SourceLocation }> = [];

  const paths = new Map<string, ValidationFile>();
  for (const file of artifact.files) {
    if (isUnsafePath(file.path)) {
      violations.push(violation(
        "unsafe-file-path",
        file.path,
        1,
        "Generated file paths must be relative and must not traverse outside the project.",
        file.path,
      ));
    }

    if (paths.has(file.path)) {
      violations.push(violation(
        "duplicate-file-path",
        file.path,
        1,
        "Generated artifacts must not contain duplicate file paths.",
        file.path,
      ));
    } else {
      paths.set(file.path, file);
    }
  }

  for (const file of artifact.files) {
    const sourceFile = ts.createSourceFile(
      file.path,
      file.content,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(file.path),
    );

    const locationFor = (node: ts.Node): SourceLocation => ({
      file: file.path,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    });

    const visit = (node: ts.Node, suppressVisibleText = false): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const packageName = packageNameFor(node.moduleSpecifier.text);
        if (packageName) {
          imports.push({ packageName, location: locationFor(node.moduleSpecifier) });
        }
      }

      if (!suppressVisibleText && ts.isJsxText(node)) {
        const value = node.getText(sourceFile).trim();
        if (value) {
          visibleText.push({ value, location: locationFor(node) });
        }
      }

      if (!suppressVisibleText && ts.isJsxExpression(node) && node.expression && isTextLiteral(node.expression)) {
        visibleText.push({ value: node.expression.text, location: locationFor(node.expression) });
      }

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        inspectOpeningElement(node, locationFor(node), file.path, sourceFile, violations, h1s, interactiveElements);
      }

      if (ts.isJsxElement(node)) {
        const tagName = node.openingElement.tagName.getText(sourceFile).toLowerCase();
        const isSemanticTextBlock = SEMANTIC_TEXT_BLOCK_TAGS.has(tagName) || HEADING_TAG.test(tagName);
        if (isSemanticTextBlock && !suppressVisibleText) {
          const value = normalizeWhitespace(jsxText(node.children));
          if (value) {
            visibleText.push({ value, location: locationFor(node.openingElement) });
          }
        }
        if (isPrimaryCta(node, tagName, plan.primaryCta)) {
          primaryCtas.push(locationFor(node.openingElement));
        }

        ts.forEachChild(node, (child) => visit(child, suppressVisibleText || isSemanticTextBlock));
        return;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  if (h1s.length === 0) {
    const fallback = artifact.files[0];
    violations.push(violation(
      "missing-h1",
      fallback?.path ?? "",
      1,
      "Generated output must contain exactly one H1.",
      "No <h1> element found.",
    ));
  } else if (h1s.length > 1) {
    const first = h1s[0];
    violations.push(violation(
      "multiple-h1",
      first.file,
      first.line,
      "Generated output must contain exactly one H1.",
      `Found ${h1s.length} <h1> elements.`,
    ));
  }

  const declaredPackages = new Set([
    ...artifact.packages,
    ...plan.declaredPackages,
    ...packagesDeclaredInFiles(artifact.files),
  ].map(packageNameFor).filter((value): value is string => Boolean(value)));
  for (const imported of imports) {
    if (!declaredPackages.has(imported.packageName)) {
      violations.push(violation(
        "undeclared-package",
        imported.location.file,
        imported.location.line,
        "Imported packages must be declared by the generation artifact or design plan.",
        imported.packageName,
      ));
    }
  }

  const missingFocusVisible = interactiveElements.find((element) => !element.hasFocusVisibleUtility);
  if (missingFocusVisible && !artifact.files.some(hasFocusVisibleSelector)) {
    const first = missingFocusVisible;
    violations.push(violation(
      "missing-focus-visible",
      first.file,
      first.line,
      "Interactive controls require a visible focus-visible treatment.",
      "No focus-visible selector or utility was found.",
    ));
  }

  if (primaryCtas.length > 1) {
    const first = primaryCtas[0];
    violations.push(violation(
      "duplicate-primary-cta",
      first.file,
      first.line,
      "The planned primary CTA may appear only once.",
      `Found ${primaryCtas.length} primary CTA elements.`,
    ));
  }

  for (const text of visibleText) {
    if (looksLikeProof(text.value) && !isAllowedProof(text.value, brief.contentFacts, brief.allowedPlaceholders)) {
      violations.push(violation(
        "invented-proof",
        text.location.file,
        text.location.line,
        "Proof claims must be supplied by the product brief or marked as an allowed placeholder.",
        text.value,
      ));
    }
  }

  return violations;
}

function inspectOpeningElement(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  location: SourceLocation,
  file: string,
  sourceFile: ts.SourceFile,
  violations: RuleViolation[],
  h1s: SourceLocation[],
  interactiveElements: InteractiveElement[],
): void {
  const tagName = node.tagName.getText(sourceFile).toLowerCase();
  if (tagName === "h1") {
    h1s.push(location);
  }
  if (INTERACTIVE_TAG.has(tagName) || (tagName === "a" && hasAttribute(node, "href"))) {
    interactiveElements.push({ ...location, hasFocusVisibleUtility: hasFocusVisibleUtility(node) });
  }

  const styleAttribute = attributeNamed(node, "style");
  const classText = classNameText(node);
  if (styleAttribute && hasInlineStyleProperty(styleAttribute, /color/i)) {
    violations.push(violation(
      "inline-color",
      file,
      location.line,
      "Colors must be defined in named tokens instead of inline JSX styles.",
      styleAttribute.getText(sourceFile),
    ));
  }
  if (styleAttribute && hasInlineStyleProperty(styleAttribute, /font-?family/i)) {
    violations.push(violation(
      "inline-font-family",
      file,
      location.line,
      "Font families must be defined in named tokens instead of inline JSX styles.",
      styleAttribute.getText(sourceFile),
    ));
  }

  if (classText && ARBITRARY_COLOR_UTILITY.test(classText)) {
    violations.push(violation(
      "inline-color",
      file,
      location.line,
      "Colors must be defined in named tokens instead of arbitrary literal utility values.",
      classText,
    ));
  }
  if (classText && ARBITRARY_FONT_UTILITY.test(classText)) {
    violations.push(violation(
      "inline-font-family",
      file,
      location.line,
      "Font families must be defined in named tokens instead of arbitrary literal utility values.",
      classText,
    ));
  }

  if (HEADING_TAG.test(tagName) && (hasItalicClass(node) || hasInlineItalicStyle(styleAttribute))) {
    violations.push(violation(
      "italic-heading",
      file,
      location.line,
      "Headings must use roman type; carry emphasis with weight or color instead.",
      node.getText(sourceFile),
    ));
  }
}

function scriptKindForPath(path: string): ts.ScriptKind {
  if (/\.tsx$/i.test(path)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(path)) return ts.ScriptKind.JSX;
  if (/\.js$/i.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function attributeNamed(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string,
): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.getText().toLowerCase() === name,
  );
}

function hasAttribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string): boolean {
  return Boolean(attributeNamed(node, name));
}

function hasInlineStyleProperty(attribute: ts.JsxAttribute, propertyName: RegExp): boolean {
  if (attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
    return propertyName.test(attribute.initializer.text);
  }
  const expression = expressionFromInitializer(attribute.initializer);
  if (!expression || !ts.isObjectLiteralExpression(expression)) {
    return false;
  }
  return expression.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) return false;
    return propertyName.test(property.name.getText());
  });
}

function hasItalicClass(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  return /(?:^|\s)italic(?:\s|$)/i.test(classNameText(node) ?? "");
}

function classNameText(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string | null {
  const initializer = attributeNamed(node, "classname")?.initializer;
  if (initializer && ts.isStringLiteral(initializer)) return initializer.text;
  const expression = expressionFromInitializer(initializer);
  return expression && isTextLiteral(expression) ? expression.text : null;
}

function hasFocusVisibleUtility(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  return /(?:^|\s)focus-visible:[^\s]+/i.test(classNameText(node) ?? "");
}

function hasFocusVisibleSelector(file: ValidationFile): boolean {
  if (!/\.(?:css|scss|sass|less)$/i.test(file.path)) return false;
  const withoutComments = file.content.replace(/\/\*[\s\S]*?\*\//g, "");
  return /(^|[}\s,])[^{}]*:focus-visible\b[^{}]*\{/i.test(withoutComments);
}

function hasInlineItalicStyle(attribute: ts.JsxAttribute | undefined): boolean {
  const expression = expressionFromInitializer(attribute?.initializer);
  if (!expression || !ts.isObjectLiteralExpression(expression)) {
    return false;
  }
  return expression.properties.some((property) => {
    if (!ts.isPropertyAssignment(property) || !/font-?style/i.test(property.name.getText())) return false;
    const value = property.initializer;
    return isTextLiteral(value) && value.text.toLowerCase() === "italic";
  });
}

function isPrimaryCta(node: ts.JsxElement, tagName: string, primaryCta: string | null): boolean {
  if (tagName !== "button" && tagName !== "a") return false;
  if (hasAttribute(node.openingElement, "data-primary-cta")) return true;
  if (!primaryCta) return false;
  return normalizeText(jsxText(node.children)) === normalizeText(primaryCta);
}

function jsxText(children: readonly ts.JsxChild[]): string {
  return children.map((child) => {
    if (ts.isJsxText(child)) return child.getText();
    if (ts.isJsxExpression(child) && child.expression && isTextLiteral(child.expression)) return child.expression.text;
    if (ts.isJsxElement(child) || ts.isJsxFragment(child)) return jsxText(child.children);
    return "";
  }).join(" ");
}

function isTextLiteral(node: ts.Expression): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function expressionFromInitializer(initializer: ts.JsxAttributeValue | undefined): ts.Expression | undefined {
  return initializer && ts.isJsxExpression(initializer) ? initializer.expression : undefined;
}

function isUnsafePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("/") || normalized.startsWith("~/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").includes("..");
}

function packageNameFor(importPath: string): string | null {
  if (!importPath || importPath.startsWith(".") || importPath.startsWith("/")) return null;
  const parts = importPath.split("/");
  return importPath.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function packagesDeclaredInFiles(files: ValidationFile[]): string[] {
  const packageFile = files.find((file) => file.path === "package.json");
  if (!packageFile) return [];

  try {
    const manifest = JSON.parse(packageFile.content) as Record<string, unknown>;
    return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((field) => {
      const packages = manifest[field];
      return packages && typeof packages === "object" && !Array.isArray(packages)
        ? Object.keys(packages as Record<string, unknown>)
        : [];
    });
  } catch {
    return [];
  }
}

function looksLikeProof(text: string): boolean {
  return NUMERIC_CLAIM.test(text) || PROOF_CLAIM.test(text);
}

function isAllowedProof(text: string, facts: string[], placeholders: string[]): boolean {
  const normalizedClaim = normalizeText(text);
  return [...facts, ...placeholders].some((allowed) => {
    const normalizedAllowed = normalizeText(allowed);
    return normalizedAllowed.length > 0 && (
      normalizedClaim.includes(normalizedAllowed) || normalizedAllowed.includes(normalizedClaim)
    );
  });
}

function normalizeText(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function violation(
  code: StaticRuleCode,
  file: string,
  line: number,
  message: string,
  evidence: string,
): RuleViolation {
  return { code, severity: "error", file, line, message, evidence };
}
