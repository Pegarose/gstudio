---
name: component-scope
description: Kullanıcı tek bir öğe (buton, input vb.) veya küçük bir bileşen üretilmesini istediğinde kullanılır. Sayfa yapısı yerine 8 durumlu (hover, active, disabled vb.) kapsamlı bileşen tasarımını yönetir.
---

# SKILL: component-scope

Layer: B (on-demand) Loads when: the brief names a single element (e.g. "a button", "a pricing card", "a nav bar"). Purpose: skip the page apparatus and ship one rigorous, reusable component with all interaction states and a disposable preview harness.

---

## When to load

Load component-scope when the request is for one isolated element rather than a page or multi-section build. It replaces design-core's page-level flow but still inherits Layer A's token, typography, and accessibility rules.

If the brief grows into a full page mid-conversation, hand off to design-core.

---

## Core mandate

One component, done to a professional standard. No surrounding hero, no invented page context, no filler sections. The value is completeness of the single element, not breadth.

---

## The eight states

Every interactive component ships styling for all eight states:

* default
* hover
* focus-visible
* active
* disabled
* loading
* error
* success

```
Every interactive component ships styling for all 8 states:
default · hover · focus-visible · active · disabled · loading · error · success
Plus a small preview wrapper that renders all 8 stacked and labelled, which
the user opens once and then deletes. Consume tokens by name; never inline.

```

Non-interactive components (e.g. a static badge) ship the states that apply; document which are intentionally omitted and why.

---

## Preview harness

Produce a small wrapper component that renders all eight states stacked and labelled, so the user can verify each at a glance. Mark it clearly as disposable — the user opens it once, confirms, then deletes it. Keep it in its own file so deletion is clean.

---

## Rules

* Consume tokens by name; never inline hex, OKLCH, or rgb().
* focus-visible must be present and visible on every interactive element.
* Tap target at least 44×44 px; no two-line clickable labels.
* Props are typed and minimal; expose only what varies.
* No fake chrome, no invented copy inside the component.
* Keep the component self-contained and importable — one concern per file.

---

## Preview requirement

Before code, state: the component's purpose, the states being shipped (and any intentionally omitted), the tokens it consumes, and the prop surface.

---

## Edge cases

* Compound components (e.g. a form): decompose into named sub-parts, each with its own states, then a composed example.
* Stateful async (loading/error/success): show realistic transitions, not just static styling — but never fabricate data; use labelled placeholders.
* Themeability: if the user may reuse it across themes, ensure every visual value routes through tokens so a theme swap needs no markup change.