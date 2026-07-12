---
name: design-intelligence
description: Proje türüne veya sektöre (e-ticaret, portföy, kurumsal vb.) göre en uygun arayüz desenleri, renk paletleri ve tasarım tavsiyeleri sunmak için kullanılır.
---

# Open Lovable Skill — [design-intelligence.md](http://design-intelligence.md)

## Purpose

design-intelligence is the industry-knowledge layer. Where design-core governs how to build well (anti-slop discipline, tokens, hierarchy, craft), design-intelligence answers what is appropriate for this kind of product: which macrostructure pattern, which style family, which palette mood, which type pairing, and — critically — which anti-patterns to avoid for that industry.

It is a lookup-and-reason layer, not a renderer. It never emits code. It produces a short, structured recommendation that design-core then executes under its own quality gate. If the two ever conflict, design-core wins: appropriateness never overrides correctness, accessibility, or honesty.

This skill is inspired by the open ui-ux-pro-max knowledge base (MIT), reimplemented as a stack-native data table rather than an external Python CLI.

## When it loads

The skill router loads design-intelligence when the brief names or implies a product category or industry (for example: "a fintech dashboard", "a spa landing page", "a developer tool", "a meditation app"). It loads alongside design-core, never instead of it. For a pure single-element request, component-scope takes precedence and design-intelligence is skipped.

## Inputs and output

Inputs:

* The product type or industry, inferred from the brief or asked once.
* Any user constraints (brand colors already supplied, required sections, tone).
* The previous build's structure and theme, so recommendations still rotate.

Output — a compact recommendation block consumed by design-core:

```
design-intelligence recommendation:
- product_type: <matched category>
- pattern: <landing/app macrostructure suggestion>
- style_family: <e.g. Soft UI, Swiss/Minimal, Bento, Editorial>
- palette_mood: <warm/cool/neutral + intent, not fixed hex>
- type_pairing: <display / body pairing suggestion>
- key_effects: <1-3 motion/interaction notes, restrained>
- anti_patterns: <what NOT to do for this industry>
- confidence: <high/medium/low + why>

```

## Operating rules

```
design-intelligence rules:
- RECOMMEND, DON'T DICTATE. Output is advisory input to design-core, which
  keeps final authority over hierarchy, tokens, and the slop-test gate.
- HONOR ROTATION. If the top recommendation matches the previous build's
  structure/theme, offer the next-best alternative so two builds still differ.
- ANTI-PATTERNS ARE BINDING. Industry anti-patterns (e.g. no AI purple/pink
  gradients for banking, no dark mode for wellness) pass through as hard
  "avoid" notes, reinforcing the anti-slop discipline rather than competing.
- PALETTE AS MOOD, NOT LOCK. Suggest a palette intent; the actual values are
  minted into OKLCH tokens by design-core or brand-extract, verified for AA.
- NEVER INVENT PROOF. Recommending a "social proof" section does not license
  inventing testimonials or metrics; design-core's honest-copy rule still holds.
- LOW CONFIDENCE IS ALLOWED. If the product type is unclear or novel, say so
  and fall back to design-core defaults rather than forcing a weak match.

```

## Relationship to the other skills

* design-core: consumes the recommendation, then chooses and rotates the actual macrostructure and mints tokens. Final authority.
* brand-extract: when brand mode is active, extracted brand tokens override the palette_mood suggestion; design-intelligence then only advises pattern and anti-patterns.
* clone-fidelity: when cloning a real URL, the source dictates structure; design-intelligence is mostly suppressed except for its anti-pattern safety notes.
* component-scope: takes precedence for single elements; design-intelligence does not load.

## Implementation note (provider adapter)

Mirror the ScraperProvider pattern. Put the knowledge base behind a small internal interface so the data source can evolve without touching generation code:

```
interface DesignIntelligenceProvider {
  recommend(productType: string, ctx): Promise<Recommendation>;
}

```

Phase 1 can ship a curated in-repo table (a few dozen high-value product types drawn from the categories our users actually build). Later phases can expand coverage or swap the backing data, all behind this one interface. Keep the table as stack-native data (JSON/CSV in the Node app), not an external service, so there is no added operational surface.

## Preview requirement

## Phase 1 Data Table (seed dataset)

This is the curated seed dataset the DesignIntelligenceProvider ships with in Phase 1 — twenty-five product types chosen to cover what Open Lovable users most commonly build. Each row is advisory input to design-core. Palette is a mood, not fixed hex. Anti-patterns are binding "avoid" notes. Expand coverage in later phases behind the same interface.

| **Product type** | **Pattern** | **Style family** | **Palette mood** | **Type pairing** | **Binding anti-patterns** |
| --- | --- | --- | --- | --- | --- |
| SaaS landing | Hero + social proof + pricing | Swiss/Minimal | Cool neutral + one accent | Grotesk display / clean sans body | No invented metrics, no AI purple/pink gradient |
| Micro-SaaS / indie tool | Marquee hero, single CTA | Minimal | Warm neutral | Grotesk / sans | No enterprise bloat, no fake logo wall |
| B2B service | Stat-led + case studies | Swiss/Minimal | Cool corporate | Sans / sans | No stock-photo handshakes, no invented client counts |
| Developer tool / IDE | Workbench, product-in-situ | Dark OLED | Dark neutral + signal accent | Mono display / sans body | No marketing fluff, no light-only design |
| AI / chatbot platform | Bento grid | AI-Native / Minimal | Cool + electric accent | Grotesk / sans | No overused sparkles emoji, no purple-pink gradient cliché |
| Cybersecurity | Stat-led, authority tone | Dark / Swiss | Dark + one alert accent | Sans / sans | No neon hacker cliché, no fear-mongering stock imagery |
| Fintech dashboard | Bento / workbench | Minimal + dimensional | Cool neutral + green/red data | Sans / mono numerals | No AI purple/pink gradient, no playful rounded toy look |
| Banking | Long document + trust blocks | Accessible / Swiss | Conservative cool | Serif or sans / sans | No AI purple/pink gradient, no trendy brutalism |
| Personal finance tracker | Bento dashboard | Soft UI | Calm cool + one accent | Sans / sans | No cluttered charts, no aggressive red everywhere |
| E-commerce (general) | Product grid + hero | Flat / Minimal | Brand-led neutral | Sans / sans | No auto-carousels, no fake scarcity timers |
| Luxury e-commerce | Editorial, image-led | Exaggerated minimalism | Monochrome + gold accent | Serif display / sans | No clutter, no bright discount badges, no neon |
| Marketplace (P2P) | Search-first + listings grid | Minimal | Neutral + trust accent | Sans / sans | No confusing dual-audience hero, no invented review counts |
| Food delivery | Hero + category tiles | Vibrant block | Warm appetite tones | Rounded sans / sans | No tiny tap targets, no muddy food stock photos |
| Medical clinic | Long document + booking | Accessible / Soft UI | Calm cool + clean white | Humanist sans / sans | No dark mode, no aggressive color, AA contrast mandatory |
| Mental health / meditation | Manifesto / soft editorial | Organic biophilic / Soft UI | Muted calm | Serif or soft sans / sans | No harsh animation, no neon, no dense UI |
| Dental / veterinary | Hero + services + booking | Soft UI | Friendly cool | Rounded sans / sans | No clinical coldness, no stock-photo overload |
| Beauty / spa | Marquee hero + testimonials | Soft UI evolution | Warm + gold accent | Cormorant-style serif / sans | No dark mode, no neon, no harsh motion |
| Restaurant | Editorial hero + menu | Editorial / Minimal | Warm rich | Serif display / sans | No auto-playing video with sound, no illegible script fonts |
| Hotel / hospitality | Image-led long document | Editorial | Warm neutral | Serif / sans | No cluttered booking widgets above the fold |
| Legal / professional | Long document, authority | Swiss/Minimal | Conservative neutral | Serif / sans | No playful illustration, no trendy gradients |
| Portfolio | Manifesto / bento | Brutalism or Minimal (pick per tone) | High-contrast mono + one accent | Grotesk display / sans | No generic template hero, no fake client logos |
| Creative agency | Motion-driven hero | Neubrutalism / Bold | Bold high-contrast | Oversized grotesk / sans | No timid corporate safe look, no invented awards |
| Gaming | Immersive hero, 3D accent | Cyberpunk / 3D | Dark + vibrant accent | Display / sans | No tiny text, no accessibility-breaking contrast |
| Habit / mood tracker | Bento dashboard | Claymorphism / Soft UI | Friendly warm | Rounded sans / sans | No overwhelming stats, no guilt-driven red streaks |
| Web3 / NFT | Bento + gallery | AI-Native / Dark | Dark + iridescent accent (restrained) | Grotesk / mono | No overused glassmorphism-on-neon, no fake roadmap hype |

Because this skill shapes appropriateness, its recommendation must be surfaced in the design-core PREVIEW paragraph in one line — matched product type, chosen pattern, and any binding anti-patterns — so the user can redirect before code streams. Example: "Read as a wellness/spa landing; using a Soft-UI marquee hero, warm-neutral palette, avoiding dark mode and neon per industry anti-patterns."