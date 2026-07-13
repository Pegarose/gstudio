import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateGenerationSchema,
  GenerationIdentitySchema,
} from "../../lib/generation/contracts/identity";

test("generation identity requires explicit project and generation IDs", () => {
  const parsed = GenerationIdentitySchema.parse({
    projectId: "42",
    generationId: "31d42e0a-a679-4b4e-a170-7a9f6a9edb95",
    sandboxId: null,
    userId: null,
  });
  assert.equal(parsed.projectId, "42");
});

test("generation creation rejects unsupported mode", () => {
  assert.throws(() =>
    CreateGenerationSchema.parse({ projectId: "42", mode: "seo" }),
  );
});
