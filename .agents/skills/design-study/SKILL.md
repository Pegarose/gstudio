---
name: design-study
description: Kullanıcı bir görsel veya referans tasarım paylaşarak "bunun gibi bir tasarım yap" dediğinde kullanılır. Referans tasarımın DNA'sını (renk, tipografi, yerleşim) piksel kopyası yapmadan taklit eder.
---

# SKILL: design-study

Layer: B (on-demand) Loads when: the user pastes a design (image, screenshot, or reference) to emulate. Purpose: extract the design DNA — structure, type, color, rhythm — not the pixels. Feed that DNA into an original build.

---

## When to load

Load design-study when the user supplies a visual reference to emulate the feel of, without a source URL to clone. It pairs with design-core, which owns the build and the final gate. It differs from clone-fidelity (which reproduces a live site's layout) and brand-extract (which pulls a live site's token values): design-study reads a static design artifact and abstracts its principles.

---

## Core mandate

Study the reference, then build something original in its spirit. Never trace the reference pixel-for-pixel, and never copy its copy, imagery, or logos. The output should feel related, not identical.

---

## What to extract

* Structure: macrostructure family (marquee, bento, long document, stat-led, workbench, manifesto), section rhythm, density.
* Type: display vs body treatment, scale contrast, weight strategy, case, tracking.
* Color: paper band (dark/mid/light), accent temperature, contrast level — abstracted into named tokens, not sampled pixel values presented as final.
* Motion cues: any implied entrance, depth, or hover behavior.
* Craft signals: spacing rhythm, alignment discipline, use of rules/dividers, negative space.

## What NOT to extract

* Exact copy or headlines from the reference.
* Logos, brand marks, licensed imagery.
* Pixel-perfect coordinates — this is a study, not a trace.

---

## Rules

```
design-study rules:
- Read the reference for DNA: structure, type, color, rhythm, motion.
- Abstract the palette and type into named tokens; do not present sampled
  pixels as final design.
- Build an ORIGINAL layout in the reference's spirit; never trace it.
- Substitute any copy, imagery, or logos with labelled placeholders.
- Respect design-core: macrostructure rotation and token discipline apply.

```

---

## Preview requirement

Before code, state: the design DNA read from the reference (structure, type strategy, color band, motion cues), the original macrostructure chosen, the token summary, and any substitutions made.

---

## Edge cases

* Low-resolution or partial reference: extract what is legible, state the gaps, and fill with principled defaults rather than guessing details.
* Multiple conflicting references: identify the common thread or ask the user which dominates; do not average them into mush.
* Reference is itself AI-slop: extract only the sound signals and explicitly avoid inheriting the slop tells (italic headings, invented metrics, default hero-features-CTA rhythm).