import assert from "node:assert/strict";
import test from "node:test";
import { assembleSystemContext } from "../../lib/generation/context/prompt-assembler";

test("clone context loads clone-fidelity from the canonical directory", () => {
  const result = assembleSystemContext({
    mode: "clone",
    prompt: "Clone https://example.com",
    projectFacts: [],
    designPlan: null,
  });

  assert.ok(result.skills.includes("clone-fidelity"));
  assert.match(result.system, /Your output must look MADE, not GENERATED/);
});

test("scratch context does not load clone-fidelity", () => {
  const result = assembleSystemContext({
    mode: "scratch",
    prompt: "Build a legal-tech site",
    projectFacts: [],
    designPlan: null,
  });

  assert.equal(result.skills.includes("clone-fidelity"), false);
});

test("inspiration mode maps to the canonical inspire intent", () => {
  const result = assembleSystemContext({
    mode: "inspiration",
    prompt: "Use this brand language",
    projectFacts: [],
    designPlan: null,
  });

  assert.ok(result.skills.includes("brand-extract"));
  assert.equal(result.skills.includes("clone-fidelity"), false);
});

test("edit context reuses its recorded base mode and includes structured project context", () => {
  const projectFacts = [{ name: "product", value: "Casework" }];
  const designPlan = { macrostructure: "Long Document" };
  const result = assembleSystemContext({
    mode: "edit",
    baseMode: "inspiration",
    prompt: "Refine the home page",
    projectFacts,
    designPlan,
  });

  assert.ok(result.skills.includes("brand-extract"));
  assert.match(result.system, /<project-facts>\n\[{"name":"product","value":"Casework"}\]\n<\/project-facts>/);
  assert.match(result.system, /<design-plan>\n{"macrostructure":"Long Document"}\n<\/design-plan>/);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(result.system, /gstudio-agent-context|sourceRoot/);
});
