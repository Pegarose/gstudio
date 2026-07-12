import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { files, sandboxId } = await request.json();
    
    if (!files || typeof files !== 'object') {
      return NextResponse.json({ success: false, error: 'Files object is required' }, { status: 400 });
    }

    const sandbox = global.activeSandbox || global.activeSandboxProvider;
    if (!sandbox) {
      return NextResponse.json({ success: false, error: 'No active sandbox' }, { status: 500 });
    }

    // Write all files directly to the sandbox
    for (const [path, content] of Object.entries(files)) {
      let fileContent: string | Buffer = content as string;
      if (typeof content === 'string' && content.startsWith('data:')) {
        const matches = content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          fileContent = Buffer.from(matches[2], 'base64');
        }
      }

      if (sandbox.writeFile) {
        await sandbox.writeFile(path, fileContent);
      } else if (sandbox.files?.write) {
        await sandbox.files.write(`/home/user/app/${path}`, fileContent);
      }
    }

    return NextResponse.json({ success: true, message: 'Files written to sandbox successfully' });
  } catch (error: any) {
    console.error('[write-sandbox-files] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
