import "./setup";
import assert from "node:assert/strict";
import test from "node:test";
import { query } from "../../lib/db";
import { POST } from "../../app/api/generations/route";
import { GET as getGeneration } from "../../app/api/generations/[generationId]/route";
import { GET as getEvents } from "../../app/api/generations/[generationId]/events/route";
import { appendGenerationEvent } from "../../lib/generation/event-repository";
import { updateGenerationStage } from "../../lib/generation/repository";
import { publishGenerationEvent } from "../../lib/generation/coordination";

test("POST /api/generations persists a queued generation with explicit identifiers", async () => {
  const project = await query(
    "INSERT INTO projects (name, target_url) VALUES ($1, $2) RETURNING id",
    ["generation-route-test", ""],
  );

  try {
    const response = await POST(new Request("http://localhost/api/generations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: String(project.rows[0].id),
        mode: "scratch",
        prompt: "Build a newsroom",
      }),
    }) as never);
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.match(body.generationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(body.projectId, String(project.rows[0].id));
    assert.equal(body.stage, "created");
    assert.equal(body.status, "queued");
  } finally {
    await query("DELETE FROM projects WHERE id = $1", [project.rows[0].id]);
  }
});

test("GET /api/generations/:generationId returns the persisted generation snapshot", async () => {
  const project = await query(
    "INSERT INTO projects (name, target_url) VALUES ($1, $2) RETURNING id",
    ["generation-snapshot-route-test", ""],
  );

  try {
    const created = await POST(new Request("http://localhost/api/generations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: String(project.rows[0].id), mode: "scratch", prompt: "Build a newsroom" }),
    }) as never);
    const { generationId } = await created.json();
    const response = await getGeneration(new Request(`http://localhost/api/generations/${generationId}`), {
      params: Promise.resolve({ generationId }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.generation.id, generationId);
    assert.equal(body.generation.projectId, String(project.rows[0].id));
    assert.equal(body.generation.status, "queued");
  } finally {
    await query("DELETE FROM projects WHERE id = $1", [project.rows[0].id]);
  }
});

test("generation events stream persisted events after the requested sequence", async () => {
  const project = await query(
    "INSERT INTO projects (name, target_url) VALUES ($1, $2) RETURNING id",
    ["generation-events-route-test", ""],
  );

  try {
    const created = await POST(new Request("http://localhost/api/generations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: String(project.rows[0].id), mode: "scratch", prompt: "Build a newsroom" }),
    }) as never);
    const { generationId } = await created.json();
    await appendGenerationEvent(generationId, { sequence: 1, type: "stage", payload: { stage: "created" } });
    await appendGenerationEvent(generationId, { sequence: 2, type: "stage", payload: { stage: "completed", status: "passed" } });
    await updateGenerationStage(generationId, "completed", "passed");

    const response = await getEvents(new Request(`http://localhost/api/generations/${generationId}/events?after=1`), {
      params: Promise.resolve({ generationId }),
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /\"sequence\":2/);
    assert.doesNotMatch(body, /\"sequence\":1/);
  } finally {
    await query("DELETE FROM projects WHERE id = $1", [project.rows[0].id]);
  }
});

test("generation events close after a terminal live event", async () => {
  const project = await query(
    "INSERT INTO projects (name, target_url) VALUES ($1, $2) RETURNING id",
    ["generation-live-events-route-test", ""],
  );

  try {
    const created = await POST(new Request("http://localhost/api/generations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: String(project.rows[0].id), mode: "scratch", prompt: "Build a newsroom" }),
    }) as never);
    const { generationId } = await created.json();
    const response = await getEvents(new Request(`http://localhost/api/generations/${generationId}/events`), {
      params: Promise.resolve({ generationId }),
    });
    const bodyPromise = response.text();

    await new Promise((resolve) => setTimeout(resolve, 25));
    await publishGenerationEvent(generationId, { sequence: 1, status: "passed" });
    const body = await bodyPromise;

    assert.equal(response.status, 200);
    assert.match(body, /\"status\":\"passed\"/);
  } finally {
    await query("DELETE FROM projects WHERE id = $1", [project.rows[0].id]);
  }
});
