import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const result = await query('SELECT * FROM projects ORDER BY created_at DESC');
    return NextResponse.json({ success: true, projects: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, targetUrl, style, planningModel, coderModel, qaModel, chatMessages } = await request.json();
    
    if (!name) {
      return NextResponse.json({ success: false, error: 'Project name is required' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO projects (name, target_url, style, planning_model, coder_model, qa_model, chat_messages)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, target_url, style, planning_model, coder_model, qa_model, chat_messages, created_at`,
      [
        name, 
        targetUrl || '', 
        style || '', 
        planningModel || '', 
        coderModel || '', 
        qaModel || '',
        chatMessages ? JSON.stringify(chatMessages) : null
      ]
    );

    return NextResponse.json({ success: true, project: result.rows[0] });
  } catch (error: any) {
    console.error('[api/projects] Error creating project:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
