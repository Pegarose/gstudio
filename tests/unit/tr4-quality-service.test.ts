import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCompleteRepairArtifact,
  buildRepairPrompt,
  buildReviewMessages,
} from "../../lib/generation/tr4-quality-service";
import type { GenerationValidation } from "../../lib/generation/quality-gate";

test("buildReviewMessages includes the original brief and generated candidate", () => {
  const candidate = '<file path="src/App.jsx">ok</file>';
  const messages = buildReviewMessages({
    prompt: "Build a newsroom",
    candidate,
  });

  assert.match(messages[0].content, /blocking/);
  assert.match(messages[1].content, /Build a newsroom/);
  assert.match(messages[1].content, /<file path="src\/App\.jsx">ok<\/file>/);
});

test("buildRepairPrompt requests a complete corrected candidate for blocking findings", () => {
  const validation: GenerationValidation = {
    pass: false,
    summary: "Primary application file is invalid",
    findings: [
      {
        severity: "blocking",
        category: "correctness",
        file: "src/App.jsx",
        message: "The component cannot render.",
        repairInstruction: "Return a valid default-exported React component.",
      },
    ],
  };

  const prompt = buildRepairPrompt({
    candidate: '<file path="src/App.jsx">broken</file>',
    validation,
  });

  assert.match(prompt, /Return the complete corrected candidate/);
  assert.match(prompt, /<file path=/);
  assert.match(prompt, /Return a valid default-exported React component\./);
});

test("assertCompleteRepairArtifact rejects a repair that omits a candidate file", () => {
  const candidate = [
    '<file path="src/App.tsx">export default function App() { return null; }</file>',
    '<file path="src/styles.css">body { margin: 0; }</file>',
  ].join("\n");
  const repaired = '<file path="src/App.tsx">export default function App() { return <main />; }</file>';

  assert.throws(
    () => assertCompleteRepairArtifact({ candidate, repaired }),
    /same file paths/i,
  );
});

test("assertCompleteRepairArtifact rejects duplicate paths and unbalanced file tags", () => {
  const candidate = '<file path="src/App.tsx">export default function App() { return null; }</file>';

  assert.throws(
    () => assertCompleteRepairArtifact({
      candidate,
      repaired: [
        '<file path="src/App.tsx">export default function App() { return <main />; }</file>',
        '<file path="src/App.tsx">export default function App() { return <section />; }</file>',
      ].join("\n"),
    }),
    /duplicate/i,
  );
  assert.throws(
    () => assertCompleteRepairArtifact({
      candidate,
      repaired: '<file path="src/App.tsx">export default function App() { return <main />; }',
    }),
    /unbalanced|open|close/i,
  );
});

test("assertCompleteRepairArtifact accepts a complete repair with the candidate paths", () => {
  const candidate = [
    '<file path="src/App.tsx">export default function App() { return null; }</file>',
    '<file path="src/styles.css">body { margin: 0; }</file>',
  ].join("\n");
  const repaired = [
    '<file path="src/App.tsx">export default function App() { return <main />; }</file>',
    '<file path="src/styles.css">body { margin: 1rem; }</file>',
  ].join("\n");

  assert.doesNotThrow(() => assertCompleteRepairArtifact({ candidate, repaired }));
});
