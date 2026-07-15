import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV2, simulateReadableStream } from "ai/test";
import {
  assertCompleteRepairArtifact,
  buildRepairPrompt,
  buildReviewMessages,
  repairGeneratedCode,
  reviewGeneratedCode,
} from "../../lib/generation/tr4-quality-service";
import {
  GenerationQualityError,
  type GenerationValidation,
} from "../../lib/generation/quality-gate";

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

test("reviewGeneratedCode normalizes a JSON-encoded findings array from an OpenAI-compatible provider", async () => {
  const model = new MockLanguageModelV2({
    doGenerate: async () => ({
      content: [{
        type: "text",
        text: JSON.stringify({
          pass: true,
          summary: "Candidate is valid.",
          findings: JSON.stringify([]),
        }),
      }],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1 },
      warnings: [],
    } as any),
  });

  const validation = await reviewGeneratedCode({
    model,
    prompt: "Build a compact homepage",
    candidate: '<file path="src/App.jsx">export default function App() { return null; }</file>',
  });

  assert.equal(validation.pass, true);
  assert.deepEqual(validation.findings, []);
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

test("repairGeneratedCode turns a streamed partial artifact into a terminal quality error", async () => {
  const candidate = [
    '<file path="src/App.tsx">export default function App() { return null; }</file>',
    '<file path="src/styles.css">body { margin: 0; }</file>',
  ].join("\n");
  const validation: GenerationValidation = {
    pass: false,
    summary: "The project needs a complete repair.",
    findings: [
      {
        severity: "blocking",
        category: "completeness",
        file: "src/styles.css",
        message: "The stylesheet is missing.",
        repairInstruction: "Return every candidate file.",
      },
    ],
  };
  const model = new MockLanguageModelV2({
    doStream: {
      stream: simulateReadableStream({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: [
          { type: "text-start", id: "repair-1" },
          {
            type: "text-delta",
            id: "repair-1",
            delta: '<file path="src/App.tsx">export default function App() { return <main />; }</file>',
          },
          { type: "text-end", id: "repair-1" },
          {
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1 },
          },
        ],
      }),
    },
  });

  await assert.rejects(
    () => repairGeneratedCode({ model, candidate, validation }),
    (error: unknown) => {
      assert.equal(error instanceof GenerationQualityError, true);
      assert.equal(
        (error as GenerationQualityError).message,
        "TR4 repair model returned an incomplete file artifact",
      );
      assert.equal((error as GenerationQualityError).validation, validation);
      assert.equal((error as GenerationQualityError).repairCount, 1);
      return true;
    },
  );
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal(model.doStreamCalls[0].maxOutputTokens, 8192);
});

test("repairGeneratedCode turns a streamed response without file tags into a terminal quality error", async () => {
  const candidate = '<file path="src/App.tsx">export default function App() { return null; }</file>';
  const validation: GenerationValidation = {
    pass: false,
    summary: "The repair must include the application file.",
    findings: [
      {
        severity: "blocking",
        category: "completeness",
        file: "src/App.tsx",
        message: "The repair artifact has no files.",
        repairInstruction: "Return the complete application file.",
      },
    ],
  };
  const model = new MockLanguageModelV2({
    doStream: {
      stream: simulateReadableStream({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: [
          { type: "text-start", id: "repair-2" },
          { type: "text-delta", id: "repair-2", delta: "I fixed the component." },
          { type: "text-end", id: "repair-2" },
          {
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1 },
          },
        ],
      }),
    },
  });

  await assert.rejects(
    () => repairGeneratedCode({ model, candidate, validation }),
    (error: unknown) => {
      assert.equal(error instanceof GenerationQualityError, true);
      assert.equal(
        (error as GenerationQualityError).message,
        "TR4 repair model returned an incomplete file artifact",
      );
      assert.equal((error as GenerationQualityError).validation, validation);
      assert.equal((error as GenerationQualityError).repairCount, 1);
      return true;
    },
  );
});
