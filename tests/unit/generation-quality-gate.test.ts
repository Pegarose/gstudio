import assert from "node:assert/strict";
import test from "node:test";
import {
  GenerationQualityError,
  type GenerationValidation,
  runGenerationQualityGate,
} from "../../lib/generation/quality-gate";

const passingValidation: GenerationValidation = {
  pass: true,
  summary: "ready",
  findings: [],
};

const failingValidation: GenerationValidation = {
  pass: false,
  summary: "missing accessible focus treatment",
  findings: [
    {
      severity: "blocking",
      category: "accessibility",
      file: "src/App.tsx",
      message: "Primary action has no visible keyboard focus state.",
      repairInstruction: "Add a visible focus-visible outline to the primary action.",
    },
  ],
};

test("returns a passing candidate without invoking repair", async () => {
  let repairCalls = 0;

  const result = await runGenerationQualityGate({
    candidate: "original candidate",
    review: async () => passingValidation,
    repair: async () => {
      repairCalls += 1;
      return "repaired candidate";
    },
  });

  assert.equal(result.candidate, "original candidate");
  assert.equal(result.validation, passingValidation);
  assert.equal(result.repairCount, 0);
  assert.equal(repairCalls, 0);
});

test("repairs one failed candidate and returns its passing replacement", async () => {
  const stages: string[] = [];
  const reviewedCandidates: string[] = [];

  const result = await runGenerationQualityGate({
    candidate: "original candidate",
    review: async (candidate) => {
      reviewedCandidates.push(candidate);
      return candidate === "original candidate"
        ? failingValidation
        : passingValidation;
    },
    repair: async (candidate, validation) => {
      assert.equal(candidate, "original candidate");
      assert.equal(validation, failingValidation);
      return "repaired candidate";
    },
    onStage: (stage) => {
      stages.push(stage);
    },
  });

  assert.equal(result.candidate, "repaired candidate");
  assert.equal(result.validation, passingValidation);
  assert.equal(result.repairCount, 1);
  assert.deepEqual(reviewedCandidates, ["original candidate", "repaired candidate"]);
  assert.deepEqual(stages, ["validating", "repairing", "validating"]);
});

test("throws a typed error after the repaired candidate also fails review", async () => {
  let reviewCalls = 0;

  await assert.rejects(
    runGenerationQualityGate({
      candidate: "original candidate",
      review: async () => {
        reviewCalls += 1;
        return failingValidation;
      },
      repair: async () => "repaired candidate",
    }),
    (error: unknown) => {
      assert.ok(error instanceof GenerationQualityError);
      assert.equal(error.validation, failingValidation);
      assert.equal(error.repairCount, 1);
      assert.equal(error.message, failingValidation.summary);
      return true;
    },
  );

  assert.equal(reviewCalls, 2);
});
