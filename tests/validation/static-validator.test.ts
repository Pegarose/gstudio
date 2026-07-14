import assert from "node:assert/strict";
import test from "node:test";
import { validateStaticRules } from "../../lib/generation/validation/static-validator";
import {
  failingBrief,
  failingFiles,
  failingPlan,
} from "../fixtures/validation/failing-files";
import {
  passingBrief,
  passingFiles,
  passingPlan,
} from "../fixtures/validation/passing-files";

function violationCodes(input: Parameters<typeof validateStaticRules>[0]) {
  return validateStaticRules(input).map((violation) => violation.code);
}

test("static validation detects deterministic JSX and artifact violations", () => {
  const codes = violationCodes({
    files: failingFiles,
    brief: failingBrief,
    plan: failingPlan,
  });

  for (const code of [
    "multiple-h1",
    "inline-color",
    "inline-font-family",
    "italic-heading",
    "unsafe-file-path",
    "duplicate-file-path",
    "undeclared-package",
    "missing-focus-visible",
    "duplicate-primary-cta",
  ]) {
    assert.ok(codes.includes(code), `expected ${code} violation`);
  }
});

test("static validation reports a missing H1", () => {
  const codes = violationCodes({
    files: [{ path: "src/App.tsx", content: "export const App = () => <main />;" }],
    brief: passingBrief,
    plan: passingPlan,
  });

  assert.ok(codes.includes("missing-h1"));
});

test("invented proof is rejected when absent from supplied facts", () => {
  const files = [{ path: "src/App.tsx", content: "export const App = () => <><h1>Welcome</h1><p>Trusted by 50,000 teams</p></>;" }];
  const codes = violationCodes({
    files,
    brief: { ...passingBrief, contentFacts: [] },
    plan: passingPlan,
  });

  assert.ok(codes.includes("invented-proof"));
});

test("confirmed and placeholder proof do not produce invented-proof violations", () => {
  const files = [{
    path: "src/App.tsx",
    content: "export const App = () => <><h1>Welcome</h1><p>Trusted by 50,000 teams</p><p>metric to confirm</p></>;",
  }];
  const codes = violationCodes({
    files,
    brief: { ...passingBrief, contentFacts: ["Trusted by 50,000 teams"] },
    plan: passingPlan,
  });

  assert.ok(!codes.includes("invented-proof"));
});

test("confirmed marked-up proof is evaluated as one semantic block", () => {
  const files = [{
    path: "src/App.tsx",
    content: "export const App = () => <><h1>Welcome</h1><p>Trusted by <strong>50,000</strong> teams</p></>;",
  }];

  const rejected = validateStaticRules({
    files,
    brief: { ...passingBrief, contentFacts: [] },
    plan: passingPlan,
  }).filter((violation) => violation.code === "invented-proof");
  const approved = validateStaticRules({
    files,
    brief: { ...passingBrief, contentFacts: ["Trusted by 50,000 teams"] },
    plan: passingPlan,
  }).filter((violation) => violation.code === "invented-proof");

  assert.deepEqual(rejected.map((violation) => violation.evidence), ["Trusted by 50,000 teams"]);
  assert.deepEqual(approved, []);
});

test("confirmed marked-up proof in a generic text container is evaluated once", () => {
  const files = [{
    path: "src/App.tsx",
    content: "export const App = () => <><h1>Welcome</h1><div>Trusted by <strong>50,000</strong> teams</div></>;",
  }];

  const rejected = validateStaticRules({
    files,
    brief: { ...passingBrief, contentFacts: [] },
    plan: passingPlan,
  }).filter((violation) => violation.code === "invented-proof");
  const approved = validateStaticRules({
    files,
    brief: { ...passingBrief, contentFacts: ["Trusted by 50,000 teams"] },
    plan: passingPlan,
  }).filter((violation) => violation.code === "invented-proof");

  assert.deepEqual(rejected.map((violation) => violation.evidence), ["Trusted by 50,000 teams"]);
  assert.deepEqual(approved, []);
});

test("static validation rejects rooted Windows and UNC artifact paths", () => {
  const codes = violationCodes({
    files: [
      { path: "src/App.tsx", content: "export const App = () => <h1>Welcome</h1>;" },
      { path: String.raw`\temp\escape.tsx`, content: "export const Rooted = true;" },
      { path: String.raw`\\server\share\escape.tsx`, content: "export const Unc = true;" },
    ],
    brief: passingBrief,
    plan: passingPlan,
  });

  assert.equal(codes.filter((code) => code === "unsafe-file-path").length, 2);
});

test("static validation requires a real focus-visible utility or selector", () => {
  const codes = violationCodes({
    files: [{
      path: "src/App.tsx",
      content: "// focus-visible\nexport const App = () => <><h1>Welcome</h1><button>Continue</button></>;",
    }],
    brief: passingBrief,
    plan: passingPlan,
  });

  assert.ok(codes.includes("missing-focus-visible"));
});

test("static validation rejects arbitrary literal Tailwind colors and fonts", () => {
  const codes = violationCodes({
    files: [{
      path: "src/App.tsx",
      content: "export const App = () => <><h1>Welcome</h1><p className=\"text-[#ff0000] bg-[rgb(0,0,0)] font-[Inter]\">Body</p></>;",
    }],
    brief: passingBrief,
    plan: passingPlan,
  });

  assert.ok(codes.includes("inline-color"));
  assert.ok(codes.includes("inline-font-family"));
});

test("passing files produce no static violations", () => {
  assert.deepEqual(
    validateStaticRules({
      files: passingFiles,
      brief: passingBrief,
      plan: passingPlan,
    }),
    [],
  );
});
