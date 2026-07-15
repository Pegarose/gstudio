import assert from "node:assert/strict";
import test from "node:test";
import { assembleSystemContext } from "../../lib/generation/context/prompt-assembler";

function section(system: string, name: string): string {
  const match = system.match(new RegExp(`<${name}>\\n([\\s\\S]*?)\\n<\\/${name}>`));
  assert.ok(match, `expected <${name}> section`);
  return match[1];
}

test("legacy clone context normalizes to the inspiration skill from the canonical directory", () => {
  const result = assembleSystemContext({
    mode: "clone",
    prompt: "Clone https://example.com",
    projectFacts: [],
    designPlan: null,
  });

  assert.ok(result.skills.includes("brand-extract"));
  assert.equal(result.skills.includes("clone-fidelity"), false);
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

test("redacts secret environment keys and values before project facts reach the model", () => {
  process.env.PROMPT_ASSEMBLER_TEST_SECRET = "test-secret-value";
  const result = assembleSystemContext({
    mode: "scratch",
    prompt: "Build a legal-tech site",
    projectFacts: [{
      OPENAI_API_KEY: "sk-live-1234567890",
      name: "PROMPT_ASSEMBLER_TEST_SECRET",
      value: "test-secret-value",
    }],
    designPlan: null,
  });

  assert.doesNotMatch(section(result.system, "project-facts"), /OPENAI_API_KEY|PROMPT_ASSEMBLER_TEST_SECRET|sk-live-1234567890|test-secret-value/);
  delete process.env.PROMPT_ASSEMBLER_TEST_SECRET;
});

test("redacts Windows and POSIX filesystem paths before named sections reach the model", () => {
  const result = assembleSystemContext({
    mode: "scratch",
    prompt: "Build a legal-tech site",
    projectFacts: [{ cache: "C:\\Users\\BCX\\.env.local", workspace: "/home/agent/GStudio" }],
    designPlan: { source: "/var/tmp/design-plan.json" },
  });

  assert.doesNotMatch(section(result.system, "project-facts"), /C:\\Users\\BCX\\.env\.local|\/home\/agent\/GStudio/);
  assert.doesNotMatch(section(result.system, "design-plan"), /\/var\/tmp\/design-plan\.json/);
});

test("redacts arbitrary and relative paths plus active environment secrets in nested context", () => {
  const previousRuntimeJwt = process.env.RUNTIME_JWT;
  process.env.RUNTIME_JWT = "opaque-runtime-value-12345";
  let result;
  try {
    result = assembleSystemContext({
      mode: "scratch",
      prompt: "Build a legal-tech site",
      projectFacts: [{ nested: [{ unrelated: "opaque-runtime-value-12345", path: "/workspace/private/.env", unc: "\\\\server\\share\\private.env" }], relative: "./private/.env" }],
      designPlan: { nested: [{ keyStore: "/usr/local/share/keys", parent: "../private/.env", home: "~/.config/private", windows: "D:\\work\\private\\.env", unrelated: "opaque-runtime-value-12345" }] },
    });
  } finally {
    if (previousRuntimeJwt === undefined) delete process.env.RUNTIME_JWT;
    else process.env.RUNTIME_JWT = previousRuntimeJwt;
  }

  assert.doesNotMatch(section(result!.system, "project-facts"), /opaque-runtime-value-12345|\/workspace\/private\/\.env|\.\/private\/\.env|\\\\server\\share\\private\.env/);
  assert.doesNotMatch(section(result!.system, "design-plan"), /opaque-runtime-value-12345|\/usr\/local\/share\/keys|\.\.\/private\/\.env|~\/\.config\/private|D:\\work\\private\\.env/);
});
