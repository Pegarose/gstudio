---
name: brand-extract
description: Bir sitenin marka kimliğini (renk paleti, yazı tipi, border-radius vb.) çıkarıp yeni özgün bileşenler oluştururken kullanılır. Kullanıcı "marka stilini çıkar / bu sitenin stilini al" dediğinde devreye girer.
---


# SKILL: brand-extract
Layer: B (on-demand) Loads when: brand-extension mode is on, or the brief says "extract brand / use their style". Purpose: turn a source site's visual identity into an original design system, then build brand-new components in that language. This is inspiration, not cloning.

## When to load
Load brand-extract when the user wants a source site's identity applied to original work — not a reproduction of its layout. Runs alongside design-core, which owns craft and the final gate. Do not combine with clone-fidelity; the two intents are mutually exclusive per build.

## The distinction that matters
clone-fidelity reproduces the source's layout and structure.
brand-extract borrows only the visual DNA (color, type, radius, shadow, spacing) and builds a wholly original layout from first principles.
No source section, copy, or layout is copied in brand-extract mode.

## Pipeline

## Token guide to produce
Write a named token layer into src/index.css:
--color-* — paper, ink, accent, plus supporting shades. Convert source hex/HSL to OKLCH for perceptual consistency.
--font-* — display and body families lifted from the source.
--radius-* — button and card corner radii matching the source's feel.
--shadow-* — elevation depth matching the source.
--space-* — spacing scale reflecting the source's density.

## Quality gates
Contrast: verify WCAG AA after mapping accent onto paper. If it fails, adjust the token, not the markup.
Originality: the output layout must pass the design-core macrostructure rotation. Extracting a brand does not exempt the build from structural variety.
Honesty: extracted values are the source's; the composition is original. Do not present borrowed layout as extraction.

## Preview requirement
Before code, state the extracted palette (with OKLCH values), the font pairing, radius/shadow feel, and the original macrostructure chosen — so the user can redirect the direction before any code is written.

## Edge cases
Multi-brand or inconsistent source: pick the dominant system and note the choice.
Thin or inaccessible source: if extraction quality is low, disclose it and propose sensible defaults in the source's apparent spirit rather than inventing a full identity silently.
Accessibility conflict: if the source's own palette fails AA, produce an accessible adaptation and flag the deviation from the raw source values.
