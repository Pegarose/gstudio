import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await query(
      'SELECT id, version_title, created_at FROM project_versions WHERE project_id = $1 ORDER BY created_at DESC',
      [id]
    );
    return NextResponse.json({ success: true, versions: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { action, title, files, versionId } = await request.json();
    
    if (action === 'save') {
      if (!files || typeof files !== 'object') {
        return NextResponse.json({ success: false, error: 'Files JSON is required for saving' }, { status: 400 });
      }
      const result = await query(
        'INSERT INTO project_versions (project_id, version_title, files_json) VALUES ($1, $2, $3) RETURNING id',
        [id, title || 'Code Update', JSON.stringify(files)]
      );
      return NextResponse.json({ success: true, versionId: result.rows[0].id });
    }
    
    if (action === 'revert') {
      if (!versionId) {
        return NextResponse.json({ success: false, error: 'Version ID is required for reverting' }, { status: 400 });
      }
      
      const result = await query(
        'SELECT files_json FROM project_versions WHERE id = $1',
        [versionId]
      );
      
      if (result.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Version not found' }, { status: 404 });
      }
      
      const files = result.rows[0].files_json;
      
      // Call E2B / Vercel sandbox to write back files
      // We can reuse sandbox provider writing files if we do it in Next.js or via frontend calls.
      // Returning files_json so the frontend can write them back is much simpler and CORS-safe!
      return NextResponse.json({ success: true, files });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[api/versions] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
