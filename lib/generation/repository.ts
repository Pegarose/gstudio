import { query } from "../db";
import type { CreateGenerationInput } from "./contracts/identity";
import type { GenerationStage, GenerationStatus } from "./contracts/state";
import type { ValidationReport } from "./contracts/validation";

const payloadColumns = [
  "brief_json",
  "plan_json",
  "artifact_json",
  "validation_json",
  "error_json",
] as const;

export type GenerationPayloadColumn = (typeof payloadColumns)[number];

export interface GenerationRecord {
  id: string;
  projectId: string;
  userId: string | null;
  mode: CreateGenerationInput["mode"];
  prompt: string;
  targetUrl: string | null;
  stage: GenerationStage;
  status: GenerationStatus;
  sandboxId: string | null;
  brief: unknown;
  plan: unknown;
  artifact: unknown;
  validation: unknown;
  error: unknown;
  repairCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateGenerationRecordInput = CreateGenerationInput & { id: string };

type GenerationRow = {
  id: string;
  project_id: number;
  user_id: string | null;
  mode: CreateGenerationInput["mode"];
  prompt: string;
  target_url: string | null;
  stage: GenerationStage;
  status: GenerationStatus;
  sandbox_id: string | null;
  brief_json: unknown;
  plan_json: unknown;
  artifact_json: unknown;
  validation_json: unknown;
  error_json: unknown;
  repair_count: number;
  created_at: Date;
  updated_at: Date;
};

function toGenerationRecord(row: GenerationRow): GenerationRecord {
  return {
    id: row.id,
    projectId: String(row.project_id),
    userId: row.user_id,
    mode: row.mode,
    prompt: row.prompt,
    targetUrl: row.target_url,
    stage: row.stage,
    status: row.status,
    sandboxId: row.sandbox_id,
    brief: row.brief_json,
    plan: row.plan_json,
    artifact: row.artifact_json,
    validation: row.validation_json,
    error: row.error_json,
    repairCount: row.repair_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createGeneration(input: CreateGenerationRecordInput): Promise<GenerationRecord> {
  const result = await query(
    `INSERT INTO generations (id, project_id, user_id, mode, prompt, target_url)
     VALUES ($1::uuid, $2::int, $3, $4, $5, $6)
     RETURNING *`,
    [input.id, input.projectId, input.userId, input.mode, input.prompt, input.targetUrl],
  );
  return toGenerationRecord(result.rows[0] as GenerationRow);
}

export async function getGeneration(id: string): Promise<GenerationRecord | null> {
  const result = await query("SELECT * FROM generations WHERE id = $1::uuid", [id]);
  return result.rows[0] ? toGenerationRecord(result.rows[0] as GenerationRow) : null;
}

export async function updateGenerationStage(
  id: string,
  stage: GenerationStage,
  status: GenerationStatus,
): Promise<GenerationRecord | null> {
  const result = await query(
    `UPDATE generations
     SET stage = $2, status = $3, updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [id, stage, status],
  );
  return result.rows[0] ? toGenerationRecord(result.rows[0] as GenerationRow) : null;
}

export async function saveGenerationPayload(
  id: string,
  column: GenerationPayloadColumn,
  value: unknown,
): Promise<GenerationRecord | null> {
  if (!payloadColumns.includes(column)) {
    throw new Error(`Unsupported generation payload column: ${column}`);
  }

  const result = await query(
    `UPDATE generations
     SET ${column} = $2::jsonb, updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [id, JSON.stringify(value)],
  );
  return result.rows[0] ? toGenerationRecord(result.rows[0] as GenerationRow) : null;
}

/** Persist a validation report through the existing allowlisted JSON column. */
export async function saveGenerationValidationReport(
  id: string,
  report: ValidationReport,
): Promise<GenerationRecord | null> {
  return saveGenerationPayload(id, "validation_json", report);
}

/**
 * Atomically reserves the generation's only automatic repair attempt. A
 * concurrent caller receives null instead of racing a second repair model.
 */
export async function claimGenerationRepairAttempt(id: string): Promise<GenerationRecord | null> {
  const result = await query(
    `UPDATE generations
     SET repair_count = repair_count + 1, updated_at = NOW()
     WHERE id = $1::uuid AND repair_count < 1
     RETURNING *`,
    [id],
  );
  return result.rows[0] ? toGenerationRecord(result.rows[0] as GenerationRow) : null;
}
