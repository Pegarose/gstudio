import assert from "node:assert/strict";
import test from "node:test";
import { appConfig } from "../../config/app.config";
import { normalizeTeamModel, resolveTeamModelRoute } from "../../lib/models/team-model-policy";

test("team model defaults match the approved OmniRoute policy", () => {
  assert.deepEqual(appConfig.ai.teamModelDefaults, {
    planning: "auto/best-reasoning",
    coder: "auto/best-coding",
    qa: "auto/best-reasoning",
  });
});

test("legacy unavailable selections normalize by role", () => {
  assert.equal(normalizeTeamModel("planning", "deepseek-v4-pro"), "auto/best-reasoning");
  assert.equal(normalizeTeamModel("coder", "kimi-k2.7-code"), "auto/best-coding");
  assert.equal(normalizeTeamModel("qa", "deepseek-v4-pro"), "auto/best-reasoning");
});

test("unknown and missing selections use role defaults", () => {
  assert.equal(normalizeTeamModel("planning", undefined), "auto/best-reasoning");
  assert.equal(normalizeTeamModel("coder", "unknown-model"), "auto/best-coding");
  assert.equal(normalizeTeamModel("qa", null), "auto/best-reasoning");
});

test("resolved team routes always use OmniRoute", () => {
  for (const role of ["planning", "coder", "qa"] as const) {
    const route = resolveTeamModelRoute(role, undefined);
    assert.equal(route.provider, "omniroute");
    assert.equal(route.fallbacks.length, 0);
    assert.equal(route.model, appConfig.ai.teamModelDefaults[role]);
  }
});

test("the active registry contains only OmniRoute routes", () => {
  assert.equal(appConfig.ai.modelRoutes.every((route) => route.provider === "omniroute"), true);
});
