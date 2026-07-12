---
name: clone-fidelity
description: Bir kaynak sitenin birebir kopyasını (clone) üretirken kullanılır. Kullanıcı bir URL verip "klonla / aynısını yap / bu siteyi kopyala" dediğinde devreye girer. Layout, hiyerarşi ve içerik sadakatini denetler.
---

# SKILL: clone-fidelity

Layer: B (on-demand) Loads when: a URL is provided to clone or reproduce. Purpose: govern the URL-to-app flow. Reproduce a source site's intent, layout, and rhythm faithfully — never its proprietary copy, imagery, logos, or trademarks.

---

## When to load

Load clone-fidelity whenever the brief contains a source URL to reproduce. It runs alongside design-core, which still owns the final quality gate. clone-fidelity supplies the source constraints; design-core enforces craft.

Do not load it for brand-extension requests (use brand-extract) — those build original layouts, not reproductions.

---

## Inputs

* Firecrawl markdown: the source DOM/content extracted as markdown. Treat as STRUCTURE.
* Screenshots (desktop + mobile): treat as LAYOUT and RHYTHM reference.
* User-added context: any extra request layered on the clone (e.g. "also add a booking form").

These arrive normalized through the ScraperProvider interface; the skill never calls a vendor directly.

---

## What to reproduce

* Section order and count.
* Grid rhythm and column structure.
* Heading placement and type-scale relationships.
* Navigation and footer shape.
* Interaction affordances (what looks clickable, where actions sit).

## What NOT to reproduce

* Proprietary body copy — substitute labelled placeholders in the same voice/length.
* Licensed or stock imagery — substitute built CSS/SVG art or clearly labelled placeholders.
* Logos, brand marks, trademarked assets — never copy; use a neutral labelled placeholder.

State every substitution to the user in the preview.

---

## Rules

```
clone-fidelity rules:
- Treat the Firecrawl markdown as STRUCTURE, the screenshot as LAYOUT/RHYTHM.
- Reproduce: section order, grid rhythm, heading placement, nav/footer shape,
  interaction affordances.
- Do NOT reproduce: proprietary body copy, licensed imagery, logos, brand
  marks. Substitute labelled placeholders and say so.
- Map the source's visible type scale and spacing into named tokens rather
  than hard-coding pixel values inline.
- If the source is a JS-only SPA shell or auth-walled, tell the user the
  clone will be approximate and ask for a screenshot.
- Preserve the user's added context ("also add a booking form") as a genuine
  new section built in the source's visual language.
```

---

## Token mapping

Do not hard-code the source's pixel values inline. Lift the visible type scale, spacing, radius, and color into named tokens in `src/index.css`, then reference them. This keeps the clone editable and consistent with design-core's token discipline.

---

## Edge cases

* JS-only SPA shell: Firecrawl markdown may be near-empty. Tell the user the clone will be approximate and lean on the screenshot; request a fuller screenshot if needed.
* Auth-walled or paywalled content: do not attempt to bypass. Clone only the publicly reachable surface and say so.
* Anti-bot protected source: extraction quality depends on the scraping layer (see the ScraperProvider / CloakBrowser path in the main architecture). If extraction is thin, disclose reduced fidelity rather than inventing content.
* Very long pages: cap at the six-section discipline unless the user asks for full parity; summarize the collapsed sections in the preview.

---

## Ethics gate (inherited from Layer A)

Reproduce layout, structure, and design intent — never verbatim proprietary content or assets. Decline clones intended to impersonate a real brand for deception (phishing, credential harvesting, fake storefronts). State the principle plainly.

---

## Preview requirement

Before code, state: the macrostructure detected, the section order being reproduced, the extracted token summary, every asset/copy substitution being made, and any fidelity caveat (SPA, auth wall, thin extraction).