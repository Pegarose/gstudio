import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../app/api/run-command-v2/route";
import { POST as installPackages } from "../../app/api/install-packages-v2/route";
import { GET as getSandboxStatus } from "../../app/api/sandbox-status/route";

test("run-command-v2 rejects a request without sandboxId", async () => {
  const response = await POST(new Request("http://localhost/api/run-command-v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: "pwd" }),
  }) as never);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /sandboxId/i);
});

test("install-packages-v2 rejects a request without sandboxId", async () => {
  const response = await installPackages(new Request("http://localhost/api/install-packages-v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packages: ["zod"] }),
  }) as never);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /sandboxId/i);
});

test("sandbox-status rejects a request without sandboxId", async () => {
  const response = await getSandboxStatus(new Request("http://localhost/api/sandbox-status"));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /sandboxId/i);
});
