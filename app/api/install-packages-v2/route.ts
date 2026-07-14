import { NextResponse } from "next/server";
import { z } from "zod";
import { createSandboxService } from "@/lib/sandbox/service/sandbox-service";

const InstallPackagesRequestSchema = z.object({
  sandboxId: z.string().min(1),
  packages: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  try {
    const input = InstallPackagesRequestSchema.parse(await request.json());
    const result = await createSandboxService().installPackages(input.sandboxId, input.packages);

    return NextResponse.json({
      success: result.success,
      output: result.stdout,
      error: result.stderr,
      message: result.success ? "Packages installed successfully" : "Package installation failed",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "sandboxId and packages are required" }, { status: 400 });
    }

    console.error("[install-packages-v2] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to install packages" }, { status: 500 });
  }
}
