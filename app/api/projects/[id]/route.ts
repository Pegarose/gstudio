import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    const result = await query(
      'SELECT id, name, target_url, style, planning_model, coder_model, qa_model, created_at, updated_at FROM projects WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    console.error('[api/projects/get] Error getting project:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    const result = await query(
      'DELETE FROM projects WHERE id = $1 RETURNING id, name',
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Project deleted successfully', project: result.rows[0] });
  } catch (error: any) {
    console.error('[api/projects/delete] Error deleting project:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { name, targetUrl, style, planningModel, coderModel, qaModel } = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    const result = await query(
      `UPDATE projects 
       SET name = COALESCE($1, name),
           target_url = COALESCE($2, target_url),
           style = COALESCE($3, style),
           planning_model = COALESCE($4, planning_model),
           coder_model = COALESCE($5, coder_model),
           qa_model = COALESCE($6, qa_model),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, name, target_url, style, planning_model, coder_model, qa_model, updated_at`,
      [
        name !== undefined ? name : null,
        targetUrl !== undefined ? targetUrl : null,
        style !== undefined ? style : null,
        planningModel !== undefined ? planningModel : null,
        coderModel !== undefined ? coderModel : null,
        qaModel !== undefined ? qaModel : null,
        id
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    console.error('[api/projects/patch] Error updating project:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

