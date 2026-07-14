# TR4-Only Model Role Routing Design

## Objective

Route every active G Studio generation role through the configured TR4 OpenAI-compatible endpoint. OpenCode and Cline must not appear in an active role, fallback chain, or generation request while their quotas are unavailable.

The endpoint remains environment-driven through `TR4_API_BASE` and is normalized to `https://api.tr4.net/v1` by the existing provider helper. Credentials remain in `TR4_API_KEY` and must never be exposed to the browser.

## Role Assignment

| Responsibility | TR4 model | Rationale |
| --- | --- | --- |
| Planning / Architect | `gpt-5.6-terra` | Primary architecture, decomposition, and implementation planning model selected by the user. |
| Coding / Worker | `gpt-5.3-codex-spark` | Code-specialized implementation model. |
| QA / Validator | `codex-auto-review` | Dedicated review model for generated-code quality checks. |
| Intent analysis | `gpt-5.4-mini` | Fast structured classification and edit-intent planning. |
| Design analysis | `gemini-3.1-pro-low` | Design reasoning and UI-plan evaluation. |
| Visual analysis | `gemini-3.1-flash-image` | Screenshot and visual-reference analysis. |
| Repair | `gpt-5.6-sol` | Focused correction pass after validator or compilation failure. |

## Active Provider Contract

- All entries in the active role registry use `provider: "tr4"`.
- OpenCode and Cline are not valid active fallbacks.
- A TR4 failure is returned explicitly to the user. The runtime must not silently switch to an unconfigured provider.
- The role registry is the authoritative source for defaults and fallback order.
- Direct generation and edit-intent routes must resolve through the same TR4-only mapping instead of maintaining conflicting provider heuristics.

## Legacy Project Compatibility

Existing projects and browser sessions may contain models selected before this change. Requests are normalized by role before generation:

| Legacy selection | Role | Replacement |
| --- | --- | --- |
| `kimi-k2.7-code` or another OpenCode coder | Coding | `gpt-5.3-codex-spark` |
| `deepseek-v4-pro` or another OpenCode reviewer | QA | `codex-auto-review` |
| `qwen3.7-max` or another OpenCode repair model | Repair | `gpt-5.6-sol` |
| Missing or unknown planning model | Planning | `gpt-5.6-terra` |

Normalization happens at both UI hydration and the server request boundary. This prevents a stale session or database row from bypassing the TR4-only contract. Persisted project values are updated through the existing project-save flow rather than a destructive bulk database migration.

## Validator Flow

1. The Planning model prepares the structured implementation direction.
2. The Coding model generates the candidate files.
3. The QA model reviews the complete candidate before it is applied to the sandbox.
4. QA returns structured results containing `pass`, blocking findings, affected files, and repair instructions.
5. If QA passes, the candidate is applied normally.
6. If QA fails, the Repair model receives only the candidate, validator findings, and relevant project context.
7. The repaired candidate is reviewed once more by QA.
8. If the second review fails, generation stops and reports the blocking findings. Automatic repair is capped at one attempt to prevent loops and uncontrolled token use.

The validator evaluates correctness, file completeness, import validity, responsive behavior, accessibility basics, token discipline, and obvious fabricated-content violations. Runtime compilation monitoring remains a separate post-apply safety layer.

## UI Behavior

- New projects default to `gpt-5.6-terra`, `gpt-5.3-codex-spark`, and `codex-auto-review` for Planning, Coding, and QA.
- Role selectors show TR4 labels only while the TR4-only policy is active.
- Existing unavailable selections are replaced during hydration and the replacement is visible to the user.
- Progress events distinguish Planning, Coding, QA review, Repair, and final apply stages.

## Error Handling

- Missing `TR4_API_KEY` or `TR4_API_BASE` produces a clear configuration error before generation begins.
- An unavailable model produces an explicit role-and-model error.
- A validator parse failure is treated as a failed validation, not as an implicit pass.
- No partial candidate is applied when QA returns blocking findings.
- Existing sandbox rollback and Vite error handling remain unchanged.

## Verification

- Registry tests prove every active route uses TR4.
- Default-selection tests prove Planning uses `gpt-5.6-terra`, Coding uses `gpt-5.3-codex-spark`, and QA uses `codex-auto-review`.
- Compatibility tests prove stale OpenCode selections normalize to their TR4 replacements.
- API tests prove generation invokes QA before apply and caps repair at one attempt.
- Failure tests prove no OpenCode or Cline request occurs.
- Full unit, integration, TypeScript, and production-build checks must pass.

## Non-Goals

- Implementing the broader Team Orchestration persona hierarchy.
- Adding provider billing or quota dashboards.
- Automatically mutating every historical project row in PostgreSQL.
- Introducing additional external model providers.
