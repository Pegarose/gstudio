import "./setup";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { query } from "../../lib/db";
import {
  createGeneration,
  getGeneration,
  saveGenerationPayload,
  saveGenerationValidationReport,
  updateGenerationStage,
} from "../../lib/generation/repository";
import {
  appendGenerationEvent,
  listGenerationEvents,
} from "../../lib/generation/event-repository";
import {
  getSandboxLease,
  markSandboxLeaseState,
  upsertSandboxLease,
} from "../../lib/sandbox/lease-repository";

test("generation survives repository round trip", async () => {
  const project = await query(
    "INSERT INTO projects (name, target_url) VALUES ($1, $2) RETURNING id",
    ["generation-test", ""],
  );
  const generationId = randomUUID();

  try {
    await createGeneration({
      id: generationId,
      projectId: String(project.rows[0].id),
      mode: "scratch",
      prompt: "Build a newsroom",
      targetUrl: null,
      userId: null,
    });
    await updateGenerationStage(generationId, "planning", "running");
    await appendGenerationEvent(generationId, {
      sequence: 2,
      type: "stage",
      payload: { stage: "planning" },
    });
    await appendGenerationEvent(generationId, {
      sequence: 1,
      type: "stage",
      payload: { stage: "created" },
    });

    const generation = await getGeneration(generationId);
    assert.equal(generation?.stage, "planning");
    assert.equal(generation?.status, "running");
    assert.deepEqual(
      (await listGenerationEvents(generationId)).map((event) => event.sequence),
      [1, 2],
    );
  } finally {
    await query("DELETE FROM projects WHERE id = $1", [project.rows[0].id]);
  }
});

test("generation payloads use an allowlist and sandbox leases persist state", async () => {
  const project = await query(
    "INSERT INTO projects (name, target_url) VALUES ($1, $2) RETURNING id",
    ["generation-lease-test", ""],
  );
  const generationId = randomUUID();

  try {
    await createGeneration({
      id: generationId,
      projectId: String(project.rows[0].id),
      mode: "scratch",
      prompt: "Build a newsroom",
      targetUrl: null,
      userId: null,
    });
    await saveGenerationPayload(generationId, "brief_json", { audience: "readers" });
    await assert.rejects(
      saveGenerationPayload(generationId, "prompt" as never, "unsafe"),
      /Unsupported generation payload column/,
    );
    await upsertSandboxLease({
      sandboxId: "generation-test-sandbox",
      projectId: String(project.rows[0].id),
      generationId,
      provider: "e2b",
      state: "allocated",
      url: null,
      metadata: { region: "test" },
      expiresAt: null,
    });
    await markSandboxLeaseState("generation-test-sandbox", "ready");

    const lease = await getSandboxLease("generation-test-sandbox");
    assert.equal(lease?.state, "ready");
    assert.equal(lease?.projectId, String(project.rows[0].id));
  } finally {
    await query("DELETE FROM projects WHERE id = $1", [project.rows[0].id]);
  }
});

test("generation validation reports persist through the validation_json payload boundary", async () => {
  const project = await query(
    "INSERT INTO projects (name, target_url) VALUES ($1, $2) RETURNING id",
    ["generation-validation-report-test", ""],
  );
  const generationId = randomUUID();
  const report = {
    static: [],
    responsive: [],
    repairEligibility: { eligible: false, reason: "All required validation hard gates passed." },
    finalStatus: "passed" as const,
  };

  try {
    await createGeneration({
      id: generationId,
      projectId: String(project.rows[0].id),
      mode: "scratch",
      prompt: "Build a newsroom",
      targetUrl: null,
      userId: null,
    });
    await saveGenerationValidationReport(generationId, report);

    assert.deepEqual((await getGeneration(generationId))?.validation, report);
  } finally {
    await query("DELETE FROM projects WHERE id = $1", [project.rows[0].id]);
  }
});
