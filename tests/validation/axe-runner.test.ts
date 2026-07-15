import assert from "node:assert/strict";
import test from "node:test";

import { readBundledAxeSource } from "../../lib/generation/validation/axe-runner";

test("bundled axe source is loaded as raw runtime text for production browser validation", async () => {
  const source = await readBundledAxeSource();

  assert.ok(source.length > 100_000);
  assert.match(source, /axe\s*=|axe\.run|axe-core/i);
});
