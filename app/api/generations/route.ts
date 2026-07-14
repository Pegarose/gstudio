import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { CreateGenerationSchema } from "@/lib/generation/contracts/identity";
import { createGeneration } from "@/lib/generation/repository";

const GenerationResponseSchema = z.object({
  generationId: z.string().uuid(),
  projectId: z.string().min(1),
  stage: z.literal("created"),
  status: z.literal("queued"),
});

export async function POST(request: Request) {
  try {
    const input = CreateGenerationSchema.parse(await request.json());
    const project = await query("SELECT id FROM projects WHERE id = $1", [input.projectId]);

    if (!project.rows[0]) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const generation = await createGeneration({ id: randomUUID(), ...input });
    const response = GenerationResponseSchema.parse({
      generationId: generation.id,
      projectId: generation.projectId,
      stage: generation.stage,
      status: generation.status,
    });

    return NextResponse.json(response, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid generation request", issues: error.issues }, { status: 400 });
    }

    console.error("[generations] Error creating generation:", error);
    return NextResponse.json({ error: "Failed to create generation" }, { status: 500 });
  }
}
