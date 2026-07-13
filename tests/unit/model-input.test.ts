import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeGenerationModelInput } from "../../lib/generation/context/model-input";

test("sanitizes secrets and filesystem paths before generation data reaches a model", () => {
  const environmentKey = "GSTUDIO_MODEL_INPUT_TEST_SECRET";
  const originalValue = process.env[environmentKey];
  const secret = "model-input-secret-987654";
  process.env[environmentKey] = secret;

  try {
    const sanitized = sanitizeGenerationModelInput({
      prompt: `Build the project using ${secret}`,
      context: {
        nested: {
          apiKey: "live-api-key-123456",
          posixPath: "/Users/example/private-project",
          windowsPath: "C:\\Users\\example\\private-project",
          source: `const credential = "${secret}";`,
          project: "Seedling",
        },
      },
    });

    const nested = sanitized.context as Record<string, Record<string, unknown>>;
    const serialized = JSON.stringify(sanitized);
    assert.equal(sanitized.prompt, "[redacted]");
    assert.equal(nested.nested.apiKey, undefined);
    assert.equal(nested.nested.posixPath, "[redacted]");
    assert.equal(nested.nested.windowsPath, "[redacted]");
    assert.equal(nested.nested.source, "[redacted]");
    assert.equal(nested.nested.project, "Seedling");
    assert.doesNotMatch(serialized, new RegExp(secret));
    assert.doesNotMatch(serialized, /\/Users\/example\/private-project/);
    assert.doesNotMatch(serialized, /C:\\Users\\example\\private-project/);

    const benign = sanitizeGenerationModelInput({
      prompt: "Build a garden guide.",
      context: { project: "Seedling" },
    });
    assert.equal(benign.prompt, "Build a garden guide.");
    assert.deepEqual(benign.context, { project: "Seedling" });
  } finally {
    if (originalValue === undefined) {
      delete process.env[environmentKey];
    } else {
      process.env[environmentKey] = originalValue;
    }
  }
});
