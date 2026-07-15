import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGeneratedSource } from "../../lib/generation/validation/source-normalizer";

test("source normalizer removes zero-width formatting characters without changing normal Unicode", () => {
  const result = normalizeGeneratedSource([
    { path: "src/App.tsx", content: "export const App = () => <h1>Türkçe \u200D başlık</h1>;" },
  ]);

  assert.equal(result.files[0].content, "export const App = () => <h1>Türkçe  başlık</h1>;");
  assert.deepEqual(result.findings, []);
});

test("source normalizer reports require calls in ESM source", () => {
  const result = normalizeGeneratedSource([
    { path: "src/App.tsx", content: "import React from 'react';\nconst runtime = require('react');\nexport const App = () => <h1>Welcome</h1>;" },
  ]);

  assert.equal(result.files[0].content.includes("require('react')"), true);
  assert.equal(result.findings[0]?.code, "esm-require");
  assert.equal(result.findings[0]?.file, "src/App.tsx");
});
