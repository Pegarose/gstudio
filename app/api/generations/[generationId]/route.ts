import { NextResponse } from "next/server";
import { z } from "zod";
import { getGeneration } from "@/lib/generation/repository";

const GenerationParamsSchema = z.object({ generationId: z.string().uuid() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ generationId: string }> },
) {
  const parsed = GenerationParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid generationId" }, { status: 400 });
  }

  try {
    const generation = await getGeneration(parsed.data.generationId);
    if (!generation) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }

    return NextResponse.json({ generation });
  } catch (error) {
    console.error("[generations] Error reading generation:", error);
    return NextResponse.json({ error: "Failed to read generation" }, { status: 500 });
  }
}
