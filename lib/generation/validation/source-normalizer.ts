import type { ValidationFile } from "../contracts/validation";

const ZERO_WIDTH_FORMATTING = /[\u200B-\u200D\u2060\uFEFF]/g;
const ESM_FILE = /\.(?:[cm]?[jt]sx?)$/i;
const ESM_IMPORT_OR_EXPORT = /(^|\n)\s*(?:import|export)\b/m;
const REQUIRE_CALL = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

export interface SourceNormalizationFinding {
  code: "esm-require";
  file: string;
  line: number;
  message: string;
  evidence: string;
}

export interface NormalizedGeneratedSource {
  files: ValidationFile[];
  findings: SourceNormalizationFinding[];
}

/**
 * Performs deterministic, lossless cleanup before static validation. Only
 * formatting-only zero-width characters are removed; normal Unicode content
 * is preserved. ESM files containing CommonJS require calls are reported so
 * the quality gate can reject the mixed module shape instead of surfacing a
 * later, harder-to-understand runtime failure.
 */
export function normalizeGeneratedSource(files: ValidationFile[]): NormalizedGeneratedSource {
  const findings: SourceNormalizationFinding[] = [];
  const normalizedFiles = files.map((file) => {
    const content = file.content.replace(ZERO_WIDTH_FORMATTING, "");
    if (ESM_FILE.test(file.path) && ESM_IMPORT_OR_EXPORT.test(content)) {
      REQUIRE_CALL.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = REQUIRE_CALL.exec(content))) {
        findings.push({
          code: "esm-require",
          file: file.path,
          line: content.slice(0, match.index).split("\n").length,
          message: "ESM source must use import statements instead of require() calls.",
          evidence: match[0],
        });
      }
    }
    return { ...file, content };
  });

  return { files: normalizedFiles, findings };
}
