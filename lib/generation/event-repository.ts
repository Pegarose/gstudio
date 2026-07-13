import { query } from "../db";

export interface GenerationEvent {
  id: string;
  generationId: string;
  sequence: number;
  type: string;
  payload: unknown;
  createdAt: Date;
}

export interface AppendGenerationEventInput {
  sequence: number;
  type: string;
  payload: unknown;
}

type GenerationEventRow = {
  id: string | number;
  generation_id: string;
  sequence: number;
  type: string;
  payload_json: unknown;
  created_at: Date;
};

function toGenerationEvent(row: GenerationEventRow): GenerationEvent {
  return {
    id: String(row.id),
    generationId: row.generation_id,
    sequence: row.sequence,
    type: row.type,
    payload: row.payload_json,
    createdAt: row.created_at,
  };
}

export async function appendGenerationEvent(
  generationId: string,
  input: AppendGenerationEventInput,
): Promise<GenerationEvent> {
  const result = await query(
    `INSERT INTO generation_events (generation_id, sequence, type, payload_json)
     VALUES ($1::uuid, $2, $3, $4::jsonb)
     RETURNING *`,
    [generationId, input.sequence, input.type, JSON.stringify(input.payload)],
  );
  return toGenerationEvent(result.rows[0] as GenerationEventRow);
}

export async function listGenerationEvents(generationId: string): Promise<GenerationEvent[]> {
  const result = await query(
    "SELECT * FROM generation_events WHERE generation_id = $1::uuid ORDER BY sequence ASC",
    [generationId],
  );
  return result.rows.map((row) => toGenerationEvent(row as GenerationEventRow));
}
