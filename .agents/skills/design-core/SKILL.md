---
name: design-core
description: Herhangi bir tasarım veya yeniden tasarım (redesign) isteğinde kullanılır. Makro yapı (macrostructure), token disiplini, tipografi ve yerleşim kurallarını yönetir.
---

# SKILL: design-core

Layer: B (on-demand) Loads when: any build, redesign, or from-scratch request. Purpose: the anti-slop foundation. Enforces macrostructure variety, locked tokens, typographic purity, and a pre-emit self-critique so output looks made, not generated.

---

## When to load

Load design-core for every generation that produces page-level or multi-section UI. It is the default skill. It composes with clone-fidelity and brand-extract (which supply source constraints) but always owns the final quality gate before emit.

Do not load it for a single isolated component request — use component-scope instead.

---

## Core mandate

Two different briefs must never produce the same page. Variety lives in structure first, then theme, then detail. A color swap is not variety. Before touching visuals, decide the shape of the page.

---

## Decision flow (run in order, before any code)

### Step 1 — Context gate

Establish three things. Ask once if genuinely unknown; otherwise infer and disclose the inference in the preview.

* Audience: who this is for, in concrete terms.
* Primary action: the single thing the page must drive. One, not three.
* Tone: chosen from an extreme, not a hedge. Pick from: editorial, brutalist, soft, utilitarian, luxury, playful, technical, austere. "Clean and modern" is not a tone and is rejected.

### Step 2 — Pick a macrostructure first

Choose one named page-shape before any visual decision, and rotate it away from the previous build so two consecutive projects never share a rhythm.

* Marquee Hero — oversized statement headline, minimal chrome.
* Bento Grid — modular tiles of varying span.
* Long Document — editorial, reading-led.
* Stat-Led — real numbers anchor the page (only with honest data).
* Workbench — product UI shown in situ.
* Manifesto — poster-like, typography-only.

### Step 3 — Lock a theme (token set)

Define paper color, accent hue, and display style as named tokens in `src/index.css`. Two consecutive builds must differ on at least one axis:

* Paper band: dark / mid / light.
* Display style: serif / grotesk / mono.
* Accent hue: warm / cool / neutral.

### Step 4 — Decide enrichment honestly

Most strong pages are typography-only. Reach for imagery only when the brief needs it, and prefer built CSS/SVG art over invented stock photos. Never ship a fake stock photo as final design.

### Step 5 — Preview, then build

Emit the one-paragraph preview (macrostructure, theme/token summary, section order, what differs from a generic default), then stream code file-by-file.

---

## Hard rules (inherited from Layer A, enforced here)

* Locked tokens: every color and font references a named token. No inline hex, OKLCH, or rgb() in markup.
* Typography purity: headings are roman (font-style: normal). No italic emphasis words inside headings. Carry emphasis with weight, accent color, or a drawn underline.
* One H1 per page; at most two typefaces; one accent color; one primary CTA above the fold.
* At most six sections. Every section must explain, prove, deepen, or convert. Cut any that does none.
* No fake chrome: no hand-drawn browser bars, phone frames, or fake code-window title bars.
* Responsive floor: flawless at 320 / 375 / 414 / 768 px. No horizontal scroll (use overflow-x: clip, never hidden). No two-line buttons or nav links. Image grid tracks use minmax(0, 1fr), never bare 1fr.
* Honest copy: never invent a metric, testimonial, logo count, or social proof. Use a labelled placeholder or a layout that does not need one.
* Motion: plan two or three intentional motions (entrance, scroll/depth, hover). Motion serves hierarchy, not noise.

---

## Pre-emit self-critique

Silently score the plan 1–5 on six axes. Any axis below 3 triggers a revision before writing code.

* Hierarchy: is the primary action unmistakable?
* Restraint: is anything decorative that does not earn its place?
* Specificity: is the tone a real extreme, or a hedge?
* Structure: does the macrostructure differ from the last build?
* Craft: spacing rhythm, alignment, optical balance.
* Accessibility: contrast, focus-visible, tap targets, semantics.

---

## design-core self-check (checklist before emit)

* [ ] Macrostructure differs from the previous build



* [ ] Theme differs on >=1 axis from the previous build



* [ ] All colors/fonts are named tokens



* [ ] No invented metrics or testimonials



* [ ] Headings are roman; one H1; <=2 typefaces; 1 accent



* [ ] Responsive at 320/375/414/768; focus-visible on all interactives



* [ ] Every section earns its place: explain, prove, deepen, or convert




---

## Anti-patterns (reject on sight)

* Hero → three-feature → CTA → footer as an automatic default rhythm.
* Inter everywhere with a single indigo accent.
* Invented proof: "10x faster", "trusted by 50,000+ teams", "+47% conversion".
* Italic words inside headings.
* Lorem ipsum used to hide unresolved hierarchy.
* Color swap presented as a new design.