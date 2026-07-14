import { z } from "zod";

export const ValidationFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

/**
 * Minimal validation-facing shape for generated code. Broader generation
 * contracts remain intentionally outside this first validator layer.
 */
export const GenerationArtifactSchema = z.object({
  files: z.array(ValidationFileSchema),
  packages: z.array(z.string().min(1)).default([]),
});

export const ProductBriefSchema = z.object({
  contentFacts: z.array(z.string().min(1)).default([]),
  allowedPlaceholders: z.array(z.string().min(1)).default([]),
});

export const DesignPlanSchema = z.object({
  primaryCta: z.string().min(1).nullable().default(null),
  declaredPackages: z.array(z.string().min(1)).default([]),
});

export const RuleSeveritySchema = z.enum(["error", "warning"]);

export const RuleViolationSchema = z.object({
  code: z.string().min(1),
  severity: RuleSeveritySchema,
  file: z.string(),
  line: z.number().int().positive(),
  message: z.string().min(1),
  evidence: z.string(),
});

export const CheckResultSchema = z.object({
  passed: z.boolean(),
  evidence: z.string(),
});

export const ResponsiveCheckResultSchema = CheckResultSchema.extend({
  width: z.number().int().positive(),
  horizontalOverflow: z.boolean(),
});

export const VisualEvaluationSchema = z.object({
  structure: z.number().min(0).max(1),
  typography: z.number().min(0).max(1),
  color: z.number().min(0).max(1),
  spacing: z.number().min(0).max(1),
  screenshot: z.number().min(0).max(1),
  responsive: z.number().min(0).max(1).optional(),
});

export const ValidationFailureClassSchema = z.enum([
  "static-rule",
  "dependency",
  "compile",
  "runtime",
  "responsive",
  "accessibility",
  "visual-fidelity",
  "capture-policy",
  "provider-unavailable",
  "secret-missing",
  "sandbox-infrastructure",
  "user-input",
]);

export const RepairEligibilitySchema = z.object({
  eligible: z.boolean(),
  reason: z.string().min(1),
  failureClass: ValidationFailureClassSchema.optional(),
});

export const SkippedValidationStepSchema = z.object({
  step: z.enum(["build", "browser", "capture", "visual"]),
  reason: z.string().min(1),
});

export const ValidationReportSchema = z.object({
  static: z.array(RuleViolationSchema).default([]),
  dependency: CheckResultSchema.optional(),
  build: CheckResultSchema.optional(),
  compile: CheckResultSchema.optional(),
  runtime: CheckResultSchema.optional(),
  keyboard: CheckResultSchema.optional(),
  reducedMotion: CheckResultSchema.optional(),
  accessibility: CheckResultSchema.optional(),
  responsive: z.array(ResponsiveCheckResultSchema).default([]),
  capture: CheckResultSchema.optional(),
  visual: VisualEvaluationSchema.optional(),
  brandLanguage: CheckResultSchema.optional(),
  originality: CheckResultSchema.optional(),
  honesty: CheckResultSchema.optional(),
  skipped: z.array(SkippedValidationStepSchema).optional(),
  repairEligibility: RepairEligibilitySchema.optional(),
  finalStatus: z.enum(["passed", "failed"]).optional(),
});

export type ValidationFile = z.infer<typeof ValidationFileSchema>;
export type GenerationArtifact = z.input<typeof GenerationArtifactSchema>;
export type ProductBrief = z.input<typeof ProductBriefSchema>;
export type DesignPlan = z.input<typeof DesignPlanSchema>;
export type RuleViolation = z.infer<typeof RuleViolationSchema>;
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type ResponsiveCheckResult = z.infer<typeof ResponsiveCheckResultSchema>;
export type VisualEvaluation = z.infer<typeof VisualEvaluationSchema>;
export type ValidationFailureClass = z.infer<typeof ValidationFailureClassSchema>;
export type RepairEligibility = z.infer<typeof RepairEligibilitySchema>;
export type SkippedValidationStep = z.infer<typeof SkippedValidationStepSchema>;
export type ValidationReport = z.infer<typeof ValidationReportSchema>;
