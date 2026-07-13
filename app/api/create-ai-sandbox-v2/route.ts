import { NextResponse } from "next/server";
import { z } from "zod";
import { createSandboxService } from "@/lib/sandbox/service/sandbox-service";

const CreateSandboxRequestSchema = z.object({
  projectId: z.string().min(1),
  generationId: z.string().uuid().nullable().default(null),
  provider: z.enum(["e2b", "vercel"]).default("e2b"),
});

export async function POST(request: Request) {
  try {
    const input = CreateSandboxRequestSchema.parse(await request.json());
    const sandboxService = createSandboxService();
    const sandbox = await sandboxService.allocate(input);
    await sandboxService.setupViteApp(sandbox.sandboxId);

    return NextResponse.json({
      success: true,
      sandboxId: sandbox.sandboxId,
      url: sandbox.url,
      provider: sandbox.provider,
      message: "Sandbox created",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "projectId is required" }, { status: 400 });
    }

    console.error("[create-ai-sandbox-v2] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to create sandbox" }, { status: 500 });
  }
}
