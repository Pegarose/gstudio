import { z } from "zod";

export const GenerationStageSchema = z.enum([
  "created",
  "capturing",
  "planning",
  "generating",
  "applying",
  "validating",
  "repairing",
  "completed",
]);

export const GenerationStatusSchema = z.enum([
  "queued",
  "running",
  "passed",
  "failed",
  "cancelled",
]);

export type GenerationStage = z.infer<typeof GenerationStageSchema>;
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
