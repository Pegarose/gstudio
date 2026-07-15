import { NextResponse } from "next/server";
import { z } from "zod";
import { createSandboxService } from "@/lib/sandbox/service/sandbox-service";
import { sandboxManager } from "@/lib/sandbox/sandbox-manager";
import { isTransientE2BProvisioningError } from "@/lib/sandbox/providers/e2b-provider";

const CreateSandboxRequestSchema = z.object({
  projectId: z.string().min(1),
  generationId: z.string().uuid().nullable().default(null),
  provider: z.enum(["e2b", "vercel"]).default("e2b"),
});

export async function POST(request: Request) {
  try {
    const input = CreateSandboxRequestSchema.parse(await request.json());
    const sandboxService = createSandboxService({ providers: sandboxManager });
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
    const errorClass = isTransientE2BProvisioningError(error)
      ? "sandbox-infrastructure"
      : "provider-unavailable";
    return NextResponse.json({
      success: false,
      error: errorClass === "sandbox-infrastructure"
        ? "Sandbox infrastructure is temporarily unavailable. Retry the build."
        : "The sandbox provider could not create this workspace.",
      errorClass,
    }, { status: 503 });
  }
}
