import { NextResponse } from "next/server";
import { z } from "zod";
import { createSandboxService } from "@/lib/sandbox/service/sandbox-service";

const RunCommandRequestSchema = z.object({
  sandboxId: z.string().min(1),
  command: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const input = RunCommandRequestSchema.parse(await request.json());
    const result = await createSandboxService().runCommand(input.sandboxId, { command: input.command });

    return NextResponse.json({
      success: result.success,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode,
      message: result.success ? "Command executed successfully" : "Command failed",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "sandboxId and command are required" }, { status: 400 });
    }

    console.error("[run-command-v2] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to run command" }, { status: 500 });
  }
}
