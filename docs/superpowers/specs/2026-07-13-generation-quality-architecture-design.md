# G Studio Generation Quality Architecture Design

**Date:** 2026-07-13

**Status:** Approved direction

**Scope:** High-fidelity website cloning, brand-inspired original generation, and premium from-scratch website generation

## 1. Summary

G Studio will move from a single prompt-driven generation request to a staged, measurable generation pipeline. The existing `gstudio-agent-context` directory remains the canonical source for the core system prompt and design skills. Runtime services will supply those instructions with the evidence they currently lack: multimodal reference captures, durable project and sandbox state, structured artifacts, browser validation, and deterministic quality checks.

The change is an incremental refactor, not a rewrite. Reliability and explicit contracts come first; visual clone fidelity and premium from-scratch quality build on that foundation.

## 2. Problem Statement

The current prompt and skill architecture describes strong design behavior, but the runtime cannot enforce or fully support it:

- Clone generation receives scraped content but does not provide source screenshots as actual image inputs to a vision-capable model.
- Scraping uses a limited Firecrawl v1 request and captures only one viewport.
- Generation, provider routing, prompt assembly, state management, output parsing, and retry behavior are concentrated in `app/api/generate-ai-code-stream/route.ts`.
- Builder UI and orchestration are concentrated in `app/generation/page.tsx`.
- Generated files and packages are encoded in model-authored XML-like text and parsed with regular expressions.
- Quality scores are self-reported by the same model that produced the design.
- Sandbox and conversation state depend on process globals that are unsafe across concurrent requests and process restarts.
- E2B lifecycle management does not use current reconnect, pause, auto-resume, or background-process capabilities.
- Legacy and v2 sandbox routes coexist with different state assumptions.
- Tests do not exercise a complete generation through a real browser or compare source and output screenshots.

As a result, adding more instructions produces diminishing returns. The model must receive better evidence, operate through smaller contracts, and be evaluated independently.

## 3. Goals

1. Produce high-fidelity clones based on visible structure, rhythm, typography, spacing, and responsive behavior.
2. Produce original, premium websites from a brief without falling into repeated AI-template structures.
3. Keep clone, inspiration, and from-scratch modes behaviorally and evaluatively distinct.
4. Preserve `gstudio-agent-context` as the single canonical prompt and skill source.
5. Replace process-global state with durable, project-scoped generation and sandbox records.
6. Replace regex-parsed generation output with schema-validated artifacts.
7. Validate generated applications through compilation, runtime checks, accessibility checks, responsive browser tests, and mode-specific visual evaluation.
8. Preserve existing working behavior during migration through compatibility adapters and incremental route replacement.

## 4. Non-Goals

- Rewriting the entire application or builder in one release.
- Pixel-perfect copying of copyrighted assets, proprietary copy, logos, or trademarked brand elements.
- Building a general-purpose backend generator in the first implementation wave.
- Automatically repairing an unlimited number of failures. Each stage has bounded retry and repair policies.
- Treating a single screenshot similarity percentage as proof of clone quality.
- Replacing the user's existing system prompt or design skills with a third-party prompt framework.
- Bypassing authentication, paywalls, access controls, or interactive CAPTCHA challenges.
- Running every capture through every provider. Escalation must be evidence-based and bounded.

## 5. Product Modes

### 5.1 Clone Mode

Clone mode reproduces the source's visible information hierarchy, section order, grid rhythm, typography scale, spacing system, responsive transformations, and interaction affordances. Protected copy and assets are substituted according to the existing clone-fidelity rules.

Required inputs:

- Source URL.
- Desktop and mobile full-page screenshots.
- Rendered HTML and normalized content.
- Link and page map.
- Extracted design tokens and layout tree.
- Capture warnings and confidence indicators.

Primary evaluation dimensions:

- Structural similarity.
- Responsive behavior similarity.
- Typography similarity.
- Color and surface similarity.
- Spacing and density similarity.
- Runtime correctness and accessibility.

### 5.2 Inspiration Mode

Inspiration mode extracts the source's design DNA but creates a different macrostructure. It can reuse palette relationships, typography character, spacing density, radius, borders, shadows, and motion character through named tokens. It must not reuse source section composition or proprietary content.

Primary evaluation dimensions:

- Brand-language consistency.
- Structural originality.
- Token discipline.
- Product-fit and usability.
- Runtime correctness and accessibility.

### 5.3 From-Scratch Mode

From-scratch mode starts from a normalized product brief. It does not depend on a scraper and must deliberately choose an audience, primary action, tone, macrostructure, content strategy, and asset strategy before generating components.

Primary evaluation dimensions:

- Hierarchy and primary-action clarity.
- Structural originality.
- Product and industry specificity.
- Honest content.
- Craft, responsiveness, and accessibility.

## 6. Target Pipeline

```text
User request
  -> intent classification
  -> reference capture or brief normalization
  -> design and structure planning
  -> deterministic plan gate
  -> structured code generation
  -> dependency resolution
  -> sandbox apply and build
  -> runtime and accessibility validation
  -> mode-specific visual evaluation
  -> one targeted repair cycle when eligible
  -> artifact, scores, and trace persistence
```

Each stage accepts and produces a typed artifact. Stages do not read mutable process globals and do not infer an "active" project or sandbox.

## 7. Core Domain Contracts

### 7.1 Generation Identity

Every generation-related request carries explicit identifiers:

```ts
interface GenerationIdentity {
  projectId: string;
  generationId: string;
  sandboxId: string | null;
  userId: string | null;
}
```

`projectId` and `generationId` are mandatory after generation creation. `sandboxId` can be null before allocation but must never be inferred from server memory.

### 7.2 Reference Bundle

```ts
interface ReferenceBundle {
  sourceUrl: string;
  markdown: string;
  html: string;
  links: string[];
  desktopScreenshot: CapturedImage;
  mobileScreenshot: CapturedImage;
  designTokens: BrandTokens;
  layoutTree: LayoutNode[];
  pageMap: PageSummary[];
  sourceWarnings: SourceWarning[];
}
```

Screenshots are stored as durable artifacts and passed to vision-capable planning models as image content parts. They are not embedded inside prompt text as JSON strings.

### 7.3 Normalized Product Brief

```ts
interface ProductBrief {
  productType: string;
  industry: string | null;
  audience: string;
  primaryAction: string;
  tone: DesignTone;
  contentFacts: string[];
  requiredSections: string[];
  prohibitedClaims: string[];
  assetStrategy: "typography" | "css-svg" | "provided-media" | "generated-media";
}
```

Missing facts remain missing. They are not converted into invented metrics, clients, awards, testimonials, or claims.

### 7.4 Design Plan

```ts
interface DesignPlan {
  mode: "clone" | "inspiration" | "scratch";
  macrostructure: string;
  sectionPlan: SectionPlan[];
  responsivePlan: ResponsiveDecision[];
  tokenPlan: TokenPlan;
  componentInventory: ComponentPlan[];
  contentPlan: ContentPlan;
  assetPlan: AssetPlan;
  interactionPlan: InteractionPlan[];
  evidence: PlanEvidence[];
}
```

Every clone plan references screenshot or layout evidence for major decisions. Every scratch plan records why its macrostructure fits the audience and primary action.

### 7.5 Generation Artifact

```ts
interface GenerationArtifact {
  preview: GenerationPreview;
  files: Array<{ path: string; content: string }>;
  packages: string[];
  declaredGate: QualityGateScore;
  generationNotes: string[];
}
```

This contract is implemented as a Zod schema and produced through AI SDK structured output. Paths and package names are validated before sandbox application.

### 7.6 Validation Report

```ts
interface ValidationReport {
  compile: CheckResult;
  runtime: CheckResult;
  accessibility: CheckResult;
  responsive: ResponsiveCheckResult[];
  staticRules: RuleViolation[];
  visual: VisualEvaluation | null;
  repairEligibility: RepairEligibility;
  finalStatus: "passed" | "repaired" | "failed";
}
```

The model's declared quality score is retained for observability but does not determine pass or fail.

## 8. Multi-Provider Reference Capture Architecture

### 8.1 Provider and Browser-Engine Boundaries

Generation code depends on provider-neutral interfaces. A scraper provider owns capture and extraction. A browser engine owns browser launch behavior and returns a Playwright-compatible session to a provider.

```ts
interface ReferenceCaptureRequest {
  projectId: string;
  generationId: string;
  url: string;
  purpose: "clone" | "inspiration" | "resync";
  viewports: Array<{ name: "desktop" | "mobile"; width: number; height: number }>;
  maxPages: number;
  refresh: boolean;
  allowSelfHostedFallback: boolean;
  allowStealthEscalation: boolean;
}

interface ReferenceCaptureResult {
  bundle: ReferenceBundle;
  confidence: CaptureConfidenceReport;
  decision: CaptureDecision;
}

interface ReferenceProvider {
  readonly id: string;
  readonly capabilities: ReferenceProviderCapabilities;
  capture(request: ReferenceCaptureRequest): Promise<ReferenceCaptureResult>;
}

interface BrowserEngine {
  readonly id: "playwright" | "cloakbrowser";
  launch(options: BrowserLaunchOptions): Promise<BrowserSession>;
}

interface ReferenceProviderCapabilities {
  managed: boolean;
  browser: boolean;
  screenshots: boolean;
  mobile: boolean;
  crawl: boolean;
  sessions: boolean;
  proxies: boolean;
  stealth: boolean;
  adaptiveSelectors: boolean;
}
```

CloakBrowser is not modeled as a standalone scraper. It is a browser engine selected by the Crawlee provider after explicit block evidence. Scrapling is a standalone provider reached through an internal Python service boundary.

Initial evaluated dependency baselines are Crawlee 3.17, CloakBrowser 0.4.10, and Scrapling 0.4.11. The implementation plan must pin exact versions and verify their browser binaries and system dependencies in CI before production rollout.

### 8.2 Capture Policy Router

The capture policy router selects the lowest-cost provider capable of satisfying the request and permits only bounded escalation.

```ts
interface CaptureDecision {
  providerId: "firecrawl" | "crawlee" | "scrapling";
  browserEngine: "playwright" | "cloakbrowser" | null;
  reason: CaptureDecisionReason;
  attempt: number;
  maxAttempts: number;
  costClass: "managed" | "self-hosted-http" | "browser" | "stealth-browser";
}
```

Default routing:

1. Use Firecrawl for normal one-shot clone and inspiration capture.
2. Use Crawlee with standard Playwright when managed capture is incomplete, stale, or unsuitable for a user-requested self-hosted capture.
3. Escalate a Crawlee request once to CloakBrowser only after a typed block signal.
4. Use Scrapling for adaptive re-capture, recurring re-sync, selector relocation, or extraction disagreement that requires an independent parser.

Typed block signals include HTTP 403 or 429 responses, known challenge markup, repeated redirect loops, an empty rendered SPA shell, and explicit browser-automation rejection. A low content word count alone is insufficient to invoke stealth mode.

Every decision records provider, engine, reason, latency, cache status, estimated cost class, and outcome. The router does not execute all providers speculatively.

### 8.3 Firecrawl v2 Provider

Firecrawl remains the default managed provider. It requests:

- Markdown.
- Rendered HTML or raw HTML where available.
- Links and selected attributes.
- Desktop full-page screenshot with an explicit viewport.
- Mobile full-page screenshot using mobile rendering and an explicit viewport.
- Schema-guided extraction for navigation, sections, repeated cards, typography hints, and calls to action.
- Map results for URL discovery.
- Selected crawl results only when the user asks for a multi-page result or the entry page depends on a small number of key pages.

Actions handle cookie consent, delayed public content, tabs, or other deterministic pre-capture interactions. Cache settings reduce repeated capture costs while allowing explicit refresh.

### 8.4 Crawlee Provider

Crawlee is the Node-native self-hosted provider. It has two internal capture paths:

- A fast HTTP/HTML path using Cheerio-compatible parsing for static pages.
- A browser path using `PlaywrightCrawler` for JavaScript-rendered pages, screenshots, layout evidence, and deterministic interactions.

The provider owns request queues, selected link discovery, bounded retries, autoscaled concurrency, session pools, cookie persistence, proxy assignment, block detection, and per-domain request limits. It emits the same `ReferenceBundle` contract as Firecrawl.

Crawlee storage is an execution detail. Durable capture artifacts and routing decisions are copied into G Studio's PostgreSQL and artifact storage instead of depending on a crawler-local dataset as the product record.

### 8.5 CloakBrowser Engine Escalation

CloakBrowser supplies a Playwright-compatible Chromium session to the Crawlee provider. It is used only for publicly reachable pages where standard capture produced a typed block signal.

The engine adapter controls:

- Browser binary version and integrity verification.
- Headless mode.
- Viewport, locale, timezone, and user-agent consistency.
- Proxy configuration and WebRTC leak controls.
- Optional humanized interaction for deterministic public-page preparation.
- Ephemeral versus persistent profile selection.

Persistent profiles are disabled by default. When explicitly enabled for a recurring public capture, profile artifacts are encrypted, project-scoped, time-limited, and never contain user authentication credentials.

CloakBrowser runs in a dedicated browser-worker image rather than the existing `node:20-alpine` web image. This isolates Chromium system dependencies, browser crashes, binary downloads, and memory limits from the Next.js application.

If an interactive CAPTCHA, authentication wall, or paywall remains visible, capture stops and returns a policy warning. The system does not connect CAPTCHA-solving services or attempt to bypass access controls.

### 8.6 Scrapling Adaptive Service

Scrapling runs as a version-pinned Python sidecar with an internal-only API. It is not imported by the Next.js process and does not rely on a developer machine's globally installed Python package.

The sidecar exposes three scoped operations:

- `capture`: Fetch and normalize a public document through a selected HTTP, dynamic, or stealth session profile.
- `extract`: Apply structured extraction rules to a captured document.
- `adaptive-recapture`: Re-locate previously recorded elements after public-page DOM changes and report confidence and match evidence.

Scrapling's primary product role is recurring watch/re-sync and adaptive extraction. It can also serve as an independent extraction fallback when Firecrawl and Crawlee disagree, but it does not replace the desktop and mobile screenshot requirements. Screenshot evidence continues to come from a provider or browser engine with an explicit viewport contract.

The sidecar enforces request timeout, memory, CPU, concurrency, response-size, redirect, domain allow/deny, and proxy policies. It returns typed results over the internal Docker network and has no direct public endpoint.

### 8.7 Capture Confidence and Provider Agreement

Every capture receives a confidence report based on evidence rather than provider identity:

- Screenshot availability and dimensions.
- Rendered HTML completeness.
- Visible-text and landmark coverage.
- Navigation and section extraction consistency.
- Mobile and desktop capture agreement.
- Challenge or block indicators.
- Parser warnings and adaptive-match confidence.

When two providers are used, their normalized landmark and section structures are compared. A disagreement can trigger Scrapling extraction only when the missing evidence materially affects clone planning. The planner receives warnings instead of silently treating incomplete evidence as authoritative.

### 8.8 Responsible Capture Controls

All providers share one policy layer:

- Capture only publicly reachable content.
- Do not bypass authentication, authorization, paywalls, or interactive CAPTCHA challenges.
- Enforce per-domain rate limits, concurrency limits, redirect limits, and maximum page counts.
- Respect user-request scope and avoid unrestricted whole-domain crawling.
- Store provider and proxy audit metadata without storing secrets in generation traces.
- Redact cookies, authorization headers, proxy credentials, and browser-profile secrets from logs.
- Stop bounded escalation after the configured attempt limit and disclose reduced fidelity.

### 8.9 Layout Normalization

Rendered HTML is normalized into a compact layout tree containing:

- Landmark and section order.
- Bounding-box relationships when available.
- Grid and flex direction.
- Repeated component groups.
- Major text roles and visible scale relationships.
- Image aspect ratios.
- Breakpoint-specific visibility and ordering differences.

The layout tree is evidence for planning, not a code-generation template.

## 9. Generation Orchestration

### 9.1 Role Separation

The pipeline defines explicit model roles:

- **Intent model:** Determines clone, inspiration, scratch, or edit mode and identifies missing inputs.
- **Vision planner:** Uses screenshots and normalized evidence to create clone or inspiration plans.
- **Design planner:** Creates scratch-mode plans from the normalized brief and design skills.
- **Code model:** Produces a structured generation artifact from an approved plan.
- **Repair model:** Receives only failed checks, relevant files, and the original plan.

One physical model may serve multiple roles, but routing decisions are capability-based rather than hard-coded provider branches.

### 9.2 Model Registry

```ts
interface ModelRoute {
  id: string;
  provider: string;
  model: string;
  capabilities: {
    vision: boolean;
    structuredOutput: boolean;
    reasoning: boolean;
    toolUse: boolean;
  };
  timeoutMs: number;
  fallbacks: string[];
}
```

The orchestrator requests capabilities for a role. It never selects a provider through route-local conditional logic. Fallbacks preserve the same typed input and output contract.

### 9.3 Prompt Assembly

`gstudio-agent-context` remains canonical. A prompt assembler loads:

1. The always-on core prompt.
2. The mode-specific skills selected by the intent router.
3. Project facts and previous design decisions.
4. The typed design plan.
5. A concise output schema description.

Prompt assembly is deterministic and snapshot-tested. Runtime routes do not maintain separate copies of the core rules.

## 10. Sandbox Architecture

### 10.1 Sandbox Service

All sandbox operations use one interface:

```ts
interface SandboxService {
  allocate(input: SandboxAllocation): Promise<SandboxLease>;
  connect(sandboxId: string): Promise<SandboxSession>;
  writeFiles(sandboxId: string, files: GeneratedFile[]): Promise<void>;
  installPackages(sandboxId: string, packages: string[]): Promise<CommandResult>;
  startDevServer(sandboxId: string): Promise<DevServerHandle>;
  waitUntilReady(sandboxId: string, target: ReadinessTarget): Promise<ReadinessResult>;
  runCommand(sandboxId: string, command: CommandSpec): Promise<CommandResult>;
  pause(sandboxId: string): Promise<void>;
  terminate(sandboxId: string): Promise<void>;
}
```

E2B and Vercel providers implement this contract. API routes do not access provider instances directly.

### 10.2 Durable State

PostgreSQL stores:

- Projects and project versions.
- Generations and stage status.
- Messages and normalized briefs.
- Reference bundle metadata.
- Generated artifacts and validation reports.
- Sandbox lease identifiers and lifecycle timestamps.

Redis stores ephemeral coordination data:

- Stream progress.
- Job locks.
- Sandbox lease locks.
- Short-lived readiness and log cursors.
- Cancellation signals.

### 10.3 Readiness

Fixed sleeps are replaced with bounded readiness probes:

1. Confirm the background command is alive.
2. Poll the expected local HTTP endpoint.
3. Capture stdout and stderr during the polling window.
4. Return a typed timeout result with the last observed failure.

E2B sessions reconnect using the durable sandbox ID. Pause and auto-resume are used for inactive but retained projects.

## 11. Deterministic Quality Gate

### 11.1 Static Rules

Static validation checks:

- Inline color and font-family values outside the token layer.
- Missing or multiple H1 elements.
- Italic headings.
- Unsafe or invalid generated file paths.
- Unsupported imports and undeclared packages.
- Invented proof patterns such as unprovided metrics, testimonials, client counts, and awards.
- Missing focus-visible styling on interactive components.
- Duplicate primary calls to action where the plan specifies one.

### 11.2 Browser Rules

Playwright runs at 320, 375, 414, 768, and a desktop width selected for the reference or product type. It checks:

- No horizontal document overflow.
- No clipped primary navigation or action.
- No two-line primary buttons unless explicitly planned.
- Keyboard reachability and visible focus.
- Console and uncaught runtime errors.
- Image and font completion before capture.
- Reduced-motion behavior.
- Automated accessibility findings through an Axe integration.

### 11.3 Visual Evaluation

Clone mode compares source and output captures after fonts are ready and animations are disabled. Dynamic regions can be masked. Evaluation reports separate scores for:

- Section and landmark alignment.
- Relative block dimensions.
- Typography hierarchy.
- Color distribution.
- Spacing density.
- Mobile transformation behavior.

Screenshot similarity is supporting evidence. Runtime correctness and accessibility remain hard gates.

### 11.4 Repair Policy

At most one automatic repair cycle runs for a generation. The repair request contains:

- The original design plan.
- Only failed checks and evidence.
- Only files implicated by those failures plus their direct dependencies.
- A prohibition against deleting intended functionality.

Infrastructure failures, unavailable providers, capture failures, and missing user-controlled secrets are not sent to the design repair model.

## 12. Builder Decomposition

The existing builder is decomposed gradually into:

```text
features/builder/
  ui/
  hooks/
  state/
  api/

lib/generation/
  intent/
  context/
  planning/
  artifact/
  validation/
  orchestration/

lib/reference/
  providers/
  browser-engines/
  policy/
  capture/
  normalize/
  worker-clients/

lib/sandbox/
  service/
  providers/
  readiness/

lib/models/
  registry/
  routing/
  fallback/
```

The first extraction moves orchestration and stateful effects out of the React page without redesigning the builder UI. UI decomposition follows stable behavior boundaries: chat, generation timeline, preview controls, project header, file/code view, and sandbox status.

## 13. Error Handling

Errors are classified so the system applies the correct response:

- **User input:** Invalid URL, inaccessible target, or insufficient scratch brief. Return a clear actionable request.
- **Reference capture:** Partial capture produces a bundle with warnings; complete capture failure blocks clone mode but can offer scratch or inspiration without claiming fidelity.
- **Capture routing:** Provider failures trigger only policy-approved fallbacks. A block signal can escalate Crawlee from Playwright to CloakBrowser once; it cannot start an unbounded provider chain.
- **Capture policy:** Authentication walls, paywalls, interactive CAPTCHA challenges, disallowed domains, and exhausted rate limits return terminal policy outcomes rather than stealth retries.
- **Scrapling service:** Sidecar unavailability disables adaptive re-capture but does not prevent Firecrawl or Crawlee capture. Stale adaptive state is discarded when its source fingerprint does not match.
- **Model routing:** Timeout or provider failure triggers only capability-compatible fallbacks.
- **Schema validation:** Invalid structured output receives one constrained schema-repair attempt before failing.
- **Sandbox:** Reconnect before allocating a replacement. Preserve the previous project version if apply fails.
- **Dependency:** Install only validated package names. Report the package and command evidence on failure.
- **Compile/runtime:** Eligible failures enter the single targeted repair cycle.
- **Quality:** Hard-gate failures prevent a generation from being presented as successful.

Every error is attached to a generation stage and persisted with a safe message, internal code, provider, elapsed time, and retry count.

## 14. Testing Strategy

### 14.1 Contract and Unit Tests

- Intent classification fixtures.
- Prompt and skill routing snapshots.
- Reference bundle schema and normalization fixtures.
- Capture policy routing, block-signal, and bounded-escalation tests.
- Provider capability selection tests.
- Adaptive-match confidence tests.
- Generation artifact schema tests.
- Model capability routing and fallback tests.
- Sandbox provider contract tests.
- Static quality-rule tests.

### 14.2 Integration Tests

- Firecrawl fixture replay without spending API credits in normal CI.
- Crawlee HTTP and Playwright fixture replay against controlled local sites.
- CloakBrowser adapter contract tests using a local block-signal fixture; live anti-bot targets are not required for normal CI.
- Scrapling sidecar contract tests for capture, extraction, adaptive relocation, timeout, and response-size limits.
- Cross-provider normalization tests proving Firecrawl, Crawlee, and Scrapling results produce compatible landmark and section structures.
- Generation route with deterministic mocked model streams.
- PostgreSQL generation-state transitions.
- Redis lock, cancellation, and progress behavior.
- E2B reconnect and readiness behavior behind provider fakes, with a smaller optional live suite.
- Failed apply preserving the previous working project version.

### 14.3 Browser and Visual Tests

- Builder happy path for clone, inspiration, scratch, and edit modes.
- Project switching without sandbox cross-contamination.
- Responsive checks at all required widths.
- Accessibility scans.
- Stable screenshot snapshots with animations disabled and dynamic masks.
- Clone benchmark scoring against desktop and mobile reference fixtures.

### 14.4 Evaluation Set

The initial benchmark contains 30 controlled tasks:

- 10 clone references.
- 10 brand-inspiration references.
- 10 from-scratch briefs.

The set covers news/editorial, SaaS, e-commerce, portfolio, and corporate sites. Results track first-pass compile success, repair-to-pass rate, accessibility pass rate, structural repetition, clone fidelity dimensions, provider latency, and fallback causes.

Reference-capture benchmarks additionally track capture success, rendered HTML completeness, screenshot availability, challenge rate, false escalation rate, adaptive relocation accuracy, per-provider latency, and cost class. Provider routing rules change only after benchmark evidence, not anecdotal success on one target.

## 15. Observability

Each generation emits a trace with:

- Stage start and completion times.
- Model route and fallback route.
- Token and latency data where available.
- Reference-capture cache status and warnings.
- Capture provider, browser engine, routing reason, block signal, escalation count, and confidence report.
- Scrapling adaptive-match confidence and source-fingerprint changes.
- Schema-repair and code-repair attempts.
- Sandbox allocation, reconnect, pause, and termination events.
- Per-rule and per-axis validation outcomes.

Product dashboards track:

- First-pass compile rate.
- First-pass deterministic gate rate.
- Repair-to-pass rate.
- Clone fidelity by dimension.
- Scratch structure repetition rate.
- Median time to interactive preview.
- Projects shared or published after a successful generation.

## 16. Migration Sequence

### Phase 1: Reliability Foundation

- Introduce durable generation identities and records.
- Add the unified sandbox service.
- Implement E2B reconnect and readiness probes.
- Move ephemeral coordination to Redis.
- Route existing operations through compatibility adapters.
- Stop creating new dependencies on process globals.

### Phase 2: Structured Generation

- Extract generation orchestration from the large route.
- Add the model registry and capability routing.
- Add Zod schemas for plans and artifacts.
- Replace XML-like file output with structured output.
- Add deterministic static validation.

### Phase 3: High-Fidelity Clone Pipeline

- Add the provider-neutral capture contract and policy router.
- Add the Firecrawl v2 reference provider.
- Capture desktop and mobile visual evidence.
- Add vision planning and layout normalization.
- Add clone-specific browser and visual evaluation.
- Add one targeted fidelity repair cycle.

### Phase 4: Self-Hosted and Resilient Capture

- Add the Crawlee provider with fast HTTP and standard Playwright paths.
- Add request queues, sessions, proxy policy, block detection, and per-domain limits.
- Add the dedicated browser-worker image and CloakBrowser engine adapter.
- Enable one evidence-based Playwright-to-CloakBrowser escalation.
- Establish capture-provider benchmarks before changing default routing.
- Add the Scrapling Python sidecar after the provider contract and benchmarks are stable.
- Add adaptive re-capture and recurring re-sync as explicit product capabilities.

### Phase 5: Premium From-Scratch Pipeline

- Add normalized product briefs.
- Persist macrostructure and theme history per project.
- Add component-first planning and asset strategy.
- Add scratch-specific originality and honesty checks.

### Phase 6: Evaluation and Cleanup

- Establish the benchmark suite and dashboards.
- Migrate remaining frontend consumers to unified routes.
- Remove legacy routes and process-global state after usage reaches zero.
- Split stable builder UI boundaries out of the 5,000-line page.

Each phase must leave the application runnable and independently testable.

## 17. Acceptance Criteria

- `gstudio-agent-context` is the only canonical source for the core prompt and design skills.
- Clone planning receives desktop and mobile screenshots as actual multimodal inputs.
- Firecrawl, Crawlee, and Scrapling implement or map into one normalized reference-capture contract.
- Crawlee supports both fast static capture and Playwright browser capture with bounded queues, retries, sessions, and domain limits.
- CloakBrowser is used as a Crawlee browser-engine escalation, not as an always-on scraper or an independent generation dependency.
- CloakBrowser escalation requires a typed block signal and occurs at most once per capture strategy.
- Scrapling runs in a version-pinned internal Python sidecar and is used for adaptive extraction, re-sync, or evidence disagreement.
- The production system does not depend on a globally installed Scrapling package.
- Interactive CAPTCHA, authentication, paywall, and access-control outcomes terminate capture without bypass attempts.
- Provider routing records latency, outcome, confidence, escalation reason, and cost class.
- Clone, inspiration, and scratch use separate plan requirements and evaluation profiles.
- Every generation request is scoped by explicit project and generation identifiers.
- Concurrent projects cannot share an implicit active sandbox or conversation state.
- E2B sandboxes reconnect by durable ID and use bounded readiness checks instead of fixed startup sleeps.
- Generated files and packages pass a Zod schema before sandbox application.
- A generation is not marked successful until compile, runtime, responsive, and accessibility hard gates pass.
- Clone success includes separate structural, typography, color, spacing, and responsive evidence.
- Scratch generation rejects invented metrics, testimonials, awards, and client claims not present in the brief.
- Automatic repair is limited to one targeted cycle and preserves intended functionality.
- Existing project versions remain recoverable after a failed generation or sandbox apply.
- The benchmark suite reports first-pass and repair-to-pass outcomes for all three modes.

## 18. Key Decisions

1. Use an incremental staged refactor rather than a rewrite.
2. Treat prompt quality as necessary but insufficient; runtime evidence and independent validation are equally required.
3. Preserve `gstudio-agent-context` as canonical.
4. Use Firecrawl v2 as the default managed provider behind a capability-based capture interface.
5. Add Crawlee as the Node-native self-hosted provider with standard Playwright as its default browser engine.
6. Use CloakBrowser only as an evidence-based browser-engine escalation under Crawlee.
7. Use a version-pinned Scrapling sidecar for adaptive extraction and recurring re-sync rather than importing Python into the web process.
8. Keep shared responsible-capture policy above every provider and stop at authentication, paywall, or interactive CAPTCHA boundaries.
9. Use PostgreSQL for durable generation state and Redis for ephemeral coordination.
10. Use capability-based model routing.
11. Use structured model artifacts rather than regex-parsed XML-like output.
12. Use browser evidence and deterministic rules as the final quality authority.
13. Permit one targeted automatic repair cycle.
14. Decompose the builder and generation route only along behavior boundaries needed by this architecture.
