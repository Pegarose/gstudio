# Done — OmniRoute Reliability Checkpoint

> Handover document created: 15 July 2026
> Session agent: Codex
> Next agent: Codex / project owner

## Summary

This session completed the unified scratch/reference/inspiration smoke path over OmniRoute + E2B, including candidate quality validation and activation-gated apply. A transient OmniRoute empty-stream failure was isolated and made retryable. The next session can resume the planned builder editor/terminal UX redesign.

## Accomplished

- Merged the generation validation work into `main` earlier in the session history (`b6e94b0`) and rebuilt the Docker stack.
- Routed OmniRoute models through `openai.chat(model)` instead of the AI SDK v5 default Responses API (`7b33eca`).
- Added the OmniRoute fetch adapter: non-stream requests explicitly send `stream: false`; intentional stream requests remain `stream: true`.
- Added regression tests for Chat Completions model selection and fetch-body behavior.
- Verified live OmniRoute calls against `.env.local` without printing credentials:
  - QA/non-stream returned `OMNIROUTE_QA_OK` from provider `openai.chat`.
  - Coder/stream returned `OMNIROUTE_STREAM_OK` from provider `openai.chat`.
- Ran a real E2B scratch generation. The model generated a complete long candidate and reached the quality gate; it no longer failed on `/responses` JSON compatibility.
- Found the remaining live failure: a long candidate failed review and the repair response was incomplete. The cause was unbounded/legacy AI SDK v5 output-limit configuration.
- Replaced legacy `maxTokens` with `maxOutputTokens` for initial generation, and gave repair streaming the same 8192-token ceiling (`500cca7`).
- Added a schema-safe QA normalizer: OmniRoute review responses that encode `findings` as a JSON string are parsed and revalidated against the same Zod schema; markdown/non-JSON responses are still rejected.
- Wired the configured QA/repair route timeouts through AI SDK v5 `abortSignal`, so long reviews and repairs cannot hold a generation indefinitely.
- Added explicit first-generation constraints for fictional proof and plain-CSS briefs, plus a regression check for transient empty streams.
- Rebuilt Docker and ran the unified smoke harness across `scratch`, `scratch-with-reference`, and `inspiration`; all three reached `candidate-ready` and validated apply `complete`.
- Removed all `Smoke *` and `Diag *` projects through the project DELETE API. No current smoke/diagnostic project remains; historical non-prefixed verification projects and their persisted leases were left untouched.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Use `createOpenAI(...).chat(model)` only for OmniRoute | AI SDK v5 defaults `openai(model)` to Responses API; OmniRoute accepts Chat Completions and rejected the Responses response schema. |
| Explicitly set non-stream `stream: false` | OmniRoute otherwise may return streaming behavior to QA/review calls that expect JSON. |
| Keep complete-artifact repair validation strict | A partial repair must never overwrite a candidate; the repair now receives enough output budget instead of weakening the safety gate. |
| Use `maxOutputTokens` (not `maxTokens`) | This is the AI SDK v5 option name verified through Context7. |

## Technical State

### Files Created/Modified

- `lib/ai/provider-manager.ts` — OmniRoute Chat Completions selection and fetch adapter.
- `tests/unit/omniroute-fetch.test.ts` — non-stream and streaming fetch contracts.
- `tests/unit/model-router.test.ts` — asserts OmniRoute uses `openai.chat`.
- `app/api/generate-ai-code-stream/route.ts` — uses AI SDK v5 `maxOutputTokens: 8192`.
- `app/api/generate-ai-code-stream/route.ts` — bounds the legacy compatibility prompt and retries transient `empty stream` provider responses.
- `lib/generation/tr4-quality-service.ts` — repair generation has `maxOutputTokens: 8192`.
- `lib/generation/tr4-quality-service.ts` — normalizes provider review JSON before final Zod validation.
- `lib/generation/tr4-quality-service.ts` — accepts optional review/repair timeouts and forwards them as abort signals.
- `tests/generation-intent-ui.test.cjs` — checks the v5 output-token option, explicit prompt guardrails, and empty-stream retry.
- `tests/smoke/reference-builder-smoke.test.cjs` — scratch, scratch-with-reference, and inspiration end-to-end coverage.
- `tests/unit/tr4-quality-service.test.ts` — checks repair output capacity.

### Test Status

- `npm run test:smoke` — passed: 1 unified test covering 3 scenarios; each reached `candidate-ready` and apply `complete` (~298s).
- `npm run test:all` — passed with exit code 0: 43 legacy + 70 unit + 58 integration.
- `npm run test:validation` — passed with exit code 0: 44 validation tests.
- `npx tsc --noEmit` — passed with exit code 0.
- `npm run build` — passed; Docker image rebuilt and `gstudio-web` is running at `http://localhost:9010`.
- Remaining build output is limited to existing Next `<img>` performance warnings and the obsolete Compose `version` warning.

### Known Issues

- Docker Compose warns that its top-level `version` field is obsolete. This is non-blocking and intentionally untouched.

## Next Steps

1. Implement the planned builder UX pass: real file tabs/diff, a real terminal/build-log pane, and a collapsible Brand Guidelines context drawer.
2. Keep `candidate-ready` visibly distinct from validated apply success in any new builder surface.
3. Consider a separate stale-lease cleanup policy for historical `sandbox_leases`; do not delete persisted leases ad hoc.

## Blockers & Risks

- Do not log or commit `OMNIROUTE_API_KEY`; it is only in git-ignored `.env.local`.
- The active model defaults remain `auto/best-reasoning` for planning/QA and `auto/best-coding` for coder/repair.
- The live endpoint processes generation in a background async task; when testing from the terminal, preserve the HTTP client connection long enough to capture final SSE events.

## Context for Next Agent

- Current branch is `main`; the reliability and unified-smoke changes are now locally committed and have not been pushed.
- Main Docker services: web `9010`, PostgreSQL `5435`, Redis `6380`.
- `gstudio-web` was rebuilt after the latest local commit; `docker compose ps` showed web/db/redis healthy.
- Relevant project-memory topic: G Studio generation is intentionally split into `candidate-ready` (generation) and terminal success/rollback (live apply). Do not restore a terminal `complete` event to the generation route.

---

*Generated by handoff skill.*
