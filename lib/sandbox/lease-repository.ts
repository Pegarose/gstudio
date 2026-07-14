import { query } from "../db";

export interface SandboxLease {
  sandboxId: string;
  projectId: string;
  generationId: string | null;
  provider: string;
  state: string;
  url: string | null;
  metadata: unknown;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date | null;
}

export interface UpsertSandboxLeaseInput {
  sandboxId: string;
  projectId: string;
  generationId: string | null;
  provider: string;
  state: string;
  url: string | null;
  metadata: unknown;
  expiresAt: Date | null;
}

type SandboxLeaseRow = {
  sandbox_id: string;
  project_id: number;
  generation_id: string | null;
  provider: string;
  state: string;
  url: string | null;
  metadata_json: unknown;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date | null;
};

function toSandboxLease(row: SandboxLeaseRow): SandboxLease {
  return {
    sandboxId: row.sandbox_id,
    projectId: String(row.project_id),
    generationId: row.generation_id,
    provider: row.provider,
    state: row.state,
    url: row.url,
    metadata: row.metadata_json,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
  };
}

export async function upsertSandboxLease(input: UpsertSandboxLeaseInput): Promise<SandboxLease> {
  const result = await query(
    `INSERT INTO sandbox_leases (
       sandbox_id, project_id, generation_id, provider, state, url, metadata_json, expires_at
     ) VALUES ($1, $2::int, $3::uuid, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (sandbox_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       generation_id = EXCLUDED.generation_id,
       provider = EXCLUDED.provider,
       state = EXCLUDED.state,
       url = EXCLUDED.url,
       metadata_json = EXCLUDED.metadata_json,
       last_seen_at = NOW(),
       expires_at = EXCLUDED.expires_at
     RETURNING *`,
    [
      input.sandboxId,
      input.projectId,
      input.generationId,
      input.provider,
      input.state,
      input.url,
      JSON.stringify(input.metadata),
      input.expiresAt,
    ],
  );
  return toSandboxLease(result.rows[0] as SandboxLeaseRow);
}

export async function getSandboxLease(sandboxId: string): Promise<SandboxLease | null> {
  const result = await query("SELECT * FROM sandbox_leases WHERE sandbox_id = $1", [sandboxId]);
  return result.rows[0] ? toSandboxLease(result.rows[0] as SandboxLeaseRow) : null;
}

export async function markSandboxLeaseState(
  sandboxId: string,
  state: string,
): Promise<SandboxLease | null> {
  const result = await query(
    `UPDATE sandbox_leases
     SET state = $2, last_seen_at = NOW()
     WHERE sandbox_id = $1
     RETURNING *`,
    [sandboxId, state],
  );
  return result.rows[0] ? toSandboxLease(result.rows[0] as SandboxLeaseRow) : null;
}
