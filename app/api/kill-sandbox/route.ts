import { NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';

declare global {
  var activeSandboxProvider: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
}

export async function POST() {
  try {
    console.log('[kill-sandbox] Stopping active sandbox...');

    let sandboxKilled = false;
    const managedProvider = sandboxManager.getActiveProvider();

    if (managedProvider) {
      await sandboxManager.terminateAll();
      sandboxKilled = true;
      console.log('[kill-sandbox] Sandbox manager cleaned up successfully');
    }

    // Stop a legacy provider only when it is not already managed above.
    if (global.activeSandboxProvider && global.activeSandboxProvider !== managedProvider) {
      try {
        await global.activeSandboxProvider.terminate();
        sandboxKilled = true;
        console.log('[kill-sandbox] Sandbox stopped successfully');
      } catch (e) {
        console.error('[kill-sandbox] Failed to stop sandbox:', e);
      }
    }

    global.activeSandboxProvider = null;
    global.sandboxData = null;
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    }
    
    return NextResponse.json({
      success: true,
      sandboxKilled,
      message: 'Sandbox cleaned up successfully'
    });
    
  } catch (error) {
    console.error('[kill-sandbox] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message 
      }, 
      { status: 500 }
    );
  }
}
