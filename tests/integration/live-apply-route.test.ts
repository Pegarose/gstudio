import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { POST as applyGeneratedCandidate } from "../../app/api/apply-ai-code-stream/route";

const candidate = '<file path="src/App.jsx">export default function App() { return <main>Ready</main>; }</file>';

test("apply route rejects an unscoped generated candidate", async () => {
  const response = await applyGeneratedCandidate(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response: candidate, sandboxId: "sandbox-1" }),
  }) as never);

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /generation context/i);
});

test("apply stream is activation-gated and only completes after a passed report", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/apply-ai-code-stream/route.ts"), "utf8");
  const terminalSource = readFileSync(resolve(process.cwd(), "lib/generation/live/live-apply-terminal.ts"), "utf8");

  assert.match(source, /GenerationContextSchema\.safeParse/);
  assert.match(source, /createLiveValidationActivation/);
  assert.match(source, /type:\s*["']validation-started["']/);
  assert.match(source, /emitLiveActivationTerminalEvents/);
  assert.match(terminalSource, /type:\s*["']validation-report["']/);
  assert.match(terminalSource, /input\.result\.status\s*===\s*["']passed["']/);
  assert.match(source, /if \(!applicationPassed\) \{\s*return;/);
  assert.match(source, /type:\s*["']complete["']/);
});

test("live apply configures the one scoped repair path before activation", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/apply-ai-code-stream/route.ts"), "utf8");

  assert.match(source, /repair:\s*\{\s*generatePatch:/s);
  assert.match(source, /applyPatch:\s*async/);
  assert.match(source, /sandboxService\.writeFiles/);
  assert.match(source, /providerInstance\.restartViteServer/);
});

test("route delegates provider writes to the rollback-aware live apply seam", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/apply-ai-code-stream/route.ts"), "utf8");

  assert.match(source, /writeLiveCandidateFile/);
  assert.match(source, /await writeLiveCandidateFile\(\{[\s\S]*provider: providerInstance/s);
  assert.match(source, /emitLiveActivationTerminalEvents/);
  assert.match(source, /candidateMutation\?\.fail\(error\);[\s\S]{0,220}await activationPromise/s);
});

test("route converts an activation persistence rejection into one safe terminal rollback sequence", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/apply-ai-code-stream/route.ts"), "utf8");

  assert.match(source, /activationError instanceof LiveActivationPersistenceError/);
  assert.match(source, /emitLiveActivationTerminalEvents\(\{[\s\S]{0,260}activationError\.result/s);
  assert.match(source, /emittedTerminalFailure = true/);
});

test("generation stream emits candidate-ready instead of terminal complete", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/generate-ai-code-stream/route.ts"), "utf8");

  assert.match(source, /type:\s*["']candidate-ready["']/);
  assert.doesNotMatch(source, /type:\s*["']complete["']/);
});
