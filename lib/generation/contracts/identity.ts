import { z } from "zod";

export const GenerationModeSchema = z.enum([
  "clone",
  "inspiration",
  "scratch",
  "edit",
]);

export const GenerationIdentitySchema = z.object({
  projectId: z.string().min(1),
  generationId: z.string().uuid(),
  sandboxId: z.string().min(1).nullable(),
  userId: z.string().min(1).nullable(),
});

export const CreateGenerationSchema = z.object({
  projectId: z.string().min(1),
  mode: GenerationModeSchema,
  prompt: z.string().min(1),
  targetUrl: z.string().url().nullable().default(null),
  userId: z.string().min(1).nullable().default(null),
});

export type GenerationIdentity = z.infer<typeof GenerationIdentitySchema>;
export type CreateGenerationInput = z.infer<typeof CreateGenerationSchema>;
export type GenerationMode = z.infer<typeof GenerationModeSchema>;
