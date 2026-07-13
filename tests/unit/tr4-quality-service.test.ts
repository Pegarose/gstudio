import assert from "node:assert/strict";
import test from "node:test";
import {
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
