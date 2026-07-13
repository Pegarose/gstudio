import { NextResponse } from "next/server";
import { z } from "zod";
import { createSandboxService } from "@/lib/sandbox/service/sandbox-service";

const SandboxRequestSchema = z.object({ sandboxId: z.string().min(1) });

export async function GET(request: Request) {
  const parsed = SandboxRequestSchema.safeParse({
    sandboxId: new URL(request.url).searchParams.get("sandboxId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "sandboxId is required" }, { status: 400 });
  }

  try {
    const sandboxInfo = await createSandboxService().connect(parsed.data.sandboxId);
    return NextResponse.json({
      success: true,
      active: true,
      healthy: true,
      sandboxData: sandboxInfo,
      message: "Sandbox is active and healthy",
    });
  } catch (error) {
    console.error("[sandbox-status] Error:", error);
    return NextResponse.json({
      success: false,
      active: false,
      error: "Failed to resolve sandbox",
    }, { status: 500 });
  }
}
