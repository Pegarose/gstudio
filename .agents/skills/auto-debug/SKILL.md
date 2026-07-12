---
name: auto-debug
description: Sandbox ortamında derleme veya çalışma zamanı (Vite log monitor) hatası oluştuğunda kullanılır. Hata loglarını analiz edip kendi kendini iyileştiren (auto-fix) tamir döngüsünü yönetir.
---

# SKILL: auto-debug

Layer: B (on-demand) Loads when: the Vite log monitor detects a compile or runtime error in the sandbox. Purpose: close the loop with the platform's log monitor. Read the exact error, apply a scoped fix, re-run, and cap attempts before surfacing to the user.

---

## When to load

Load auto-debug when the sandbox's Vite log monitor reports an error after an emit. It runs after generation, not before, and operates on the already-written files. It does not redesign — it repairs.

---

## Core mandate

Fix only what the error points to. Preserve intent. Never "fix" by deleting functionality. A scoped, minimal repair beats a broad rewrite every time.

---

## The loop

```
auto-debug loop:
1. Watch Vite compile logs in the sandbox in real time.
2. On error (missing import, syntax, bad package), feed the exact error back
   into a scoped fix — change only what the error points to.
3. Re-run. Cap at 3 auto-fix attempts, then surface the blocker to the user
   in plain language with the failing file and line.
4. Never "fix" by deleting functionality; preserve intent.

```

---

## Error taxonomy and response

* Missing import / module not found: verify the real npm package name; let the auto-installer resolve it. If the import is a typo, correct the path — do not remove the feature.
* Syntax error: fix the exact token at the reported file and line. Do not reformat unrelated code.
* Bad or nonexistent package: replace with the correct package or a standard-library/inline equivalent; note the swap.
* Runtime error (undefined, null access): trace to the source and guard it; never silence by deleting the render path.
* Type error: correct the type or the usage, whichever preserves intent with the smaller change.

---

## Attempt cap and escalation

Cap at three auto-fix attempts on the same error. On exhaustion, stop and surface the blocker to the user in plain language, including:

* the failing file and line,
* the exact error message,
* what was tried,
* the smallest next step the user could take.

Do not loop indefinitely or thrash between two failing states.

---

## Guardrails

* Each fix must leave every file independently valid so a snapshot stays safe.
* Do not introduce new dependencies to paper over a logic bug.
* Do not disable type checking, lint rules, or error boundaries to make an error "go away".
* Preserve the user's intent and the design-core output; repair, do not restyle.