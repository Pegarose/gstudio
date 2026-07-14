export const STATIC_RULE_CODES = [
  "multiple-h1",
  "missing-h1",
  "inline-color",
  "inline-font-family",
  "italic-heading",
  "unsafe-file-path",
  "duplicate-file-path",
  "undeclared-package",
  "invented-proof",
  "missing-focus-visible",
  "duplicate-primary-cta",
] as const;

export type StaticRuleCode = (typeof STATIC_RULE_CODES)[number];
