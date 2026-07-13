import assert from "node:assert/strict";
import test from "node:test";
import { appConfig } from "../../config/app.config";
import { normalizeTeamModel, resolveTeamModelRoute } from "../../lib/models/team-model-policy";

test("team model defaults match the approved TR4 policy", () => {
  assert.deepEqual(appConfig.ai.teamModelDefaults, {
    planning: "gpt-5.6-terra",
    coder: "gpt-5.3-codex-spark",
    qa: "codex-auto-review",
  });
});

test("legacy unavailable selections normalize by role", () => {
  assert.equal(normalizeTeamModel("planning", "deepseek-v4-pro"), "gpt-5.6-terra");
  assert.equal(normalizeTeamModel("coder", "kimi-k2.7-code"), "gpt-5.3-codex-spark");
  assert.equal(normalizeTeamModel("qa", "deepseek-v4-pro"), "codex-auto-review");
});

test("unknown and missing selections use role defaults", () => {
  assert.equal(normalizeTeamModel("planning", undefined), "gpt-5.6-terra");
  assert.equal(normalizeTeamModel("coder", "unknown-model"), "gpt-5.3-codex-spark");
  assert.equal(normalizeTeamModel("qa", null), "codex-auto-review");
});

test("resolved team routes always use TR4", () => {
  for (const role of ["planning", "coder", "qa"] as const) {
    const route = resolveTeamModelRoute(role, undefined);
    assert.equal(route.provider, "tr4");
    assert.equal(route.fallbacks.length, 0);
    assert.equal(route.model, appConfig.ai.teamModelDefaults[role]);
  }
});

test("the active registry contains only TR4 routes", () => {
  assert.equal(appConfig.ai.modelRoutes.every((route) => route.provider === "tr4"), true);
});
