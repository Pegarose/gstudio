# Done — OmniRoute Reliability Checkpoint

> Handover document created: 15 July 2026
> Session agent: Codex
> Next agent: Codex / project owner

## Summary

This session moved G Studio's OmniRoute integration from the AI SDK v5 Responses API to the OpenAI-compatible Chat Completions API, then fixed a live quality-gate repair truncation risk. The next session should finish one compact end-to-end scratch smoke test, then resume the planned builder editor/terminal UX redesign.

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
- Cleaned up both disposable E2B sandboxes and both verification projects. No smoke project was left in the database.

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
- `lib/generation/tr4-quality-service.ts` — repair generation has `maxOutputTokens: 8192`.
- `lib/generation/tr4-quality-service.ts` — normalizes provider review JSON before final Zod validation.
- `tests/generation-intent-ui.test.cjs` — checks the v5 output-token option.
- `tests/unit/tr4-quality-service.test.ts` — checks repair output capacity.

### Test Status

- `npm run test:all` — passed after the QA normalizer change: 32 legacy + 60 unit + 58 integration.
- `npx tsc --noEmit` — passed after the final repair-limit change.
- Focused route and quality-service tests — passed after the final repair-limit change.
- Docker rebuilt and `gstudio-web` is running at `http://localhost:9010` on the latest image.
- Browser validation tests were previously executed successfully in split groups because the Windows `tsx --test` glob wrapper sometimes ends without a final aggregate summary. Re-run them before asserting a fully fresh release gate.

### Known Issues

- Full production scratch smoke has not yet reached `candidate-ready` followed by apply `complete`. The provider and QA normalizer now work live, but the real model still emits oversized candidates with fabricated metrics/invisible characters; the quality gate correctly rejects them after repair/revalidation.
- The first long live candidate had quality findings and its repair was incomplete. The new output limit fixes the identified truncation path, but needs the compact smoke re-run to prove it end to end.
- Docker Compose warns that its top-level `version` field is obsolete. This is non-blocking and intentionally untouched.

## Next Steps

1. Add an explicit QA timeout around the long `generateObject` review path so a slow reasoning review cannot hold a generation indefinitely.
2. Strengthen the generation prompt contract so an explicit two-file scratch request is not expanded into a generic multi-section landing page; preserve the quality gate’s fabricated-content and invisible-character blockers.
3. Re-run the compact smoke and require `validation` + `candidate-ready`, then apply and require terminal `complete` only after live validation passes.
4. Confirm the E2B preview renders the generated application rather than the sandbox-ready page, then kill the sandbox and delete the temporary project.
5. Once reliability is proven, implement the planned builder UX pass: real file tabs/diff, a real terminal/build-log pane, and a collapsible Brand Guidelines context drawer. Keep `candidate-ready` visibly distinct from validated apply success.

## Blockers & Risks

- Do not log or commit `OMNIROUTE_API_KEY`; it is only in git-ignored `.env.local`.
- The active model defaults remain `auto/best-reasoning` for planning/QA and `auto/best-coding` for coder/repair.
- The live endpoint processes generation in a background async task; when testing from the terminal, preserve the HTTP client connection long enough to capture final SSE events.

## Context for Next Agent

- Current branch is `main`; the two new local commits are `7b33eca` and `500cca7`. They have not been pushed.
- Main Docker services: web `9010`, PostgreSQL `5435`, Redis `6380`.
- `gstudio-web` was rebuilt after `500cca7`; verify with `docker compose ps` before the next smoke test.
- Relevant project-memory topic: G Studio generation is intentionally split into `candidate-ready` (generation) and terminal success/rollback (live apply). Do not restore a terminal `complete` event to the generation route.

---

*Generated by handoff skill.*
