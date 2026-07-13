# Multi-Provider Reference Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture safe, durable desktop/mobile reference evidence through Firecrawl v2 by default, Crawlee self-hosting when needed, one CloakBrowser escalation after typed block evidence, and Scrapling adaptive re-sync.

**Architecture:** A policy router selects providers by capability and evidence. Firecrawl runs from the web service; Crawlee and CloakBrowser run in a dedicated Node capture worker; Scrapling runs in an internal Python sidecar. All results normalize to one `ReferenceBundle` and store screenshots as durable artifacts.

**Tech Stack:** Firecrawl v2, Crawlee 3.17.0, Playwright, CloakBrowser 0.4.10, Scrapling 0.4.11, FastAPI 0.128.0, Pydantic 2.13.4, Uvicorn 0.51.0, Docker Compose, Zod.

## Global Constraints

- Firecrawl is the default provider for one-shot clone and inspiration capture.
- Crawlee standard Playwright runs before CloakBrowser.
- CloakBrowser requires a typed block signal and may run once per capture strategy.
- Scrapling is used for adaptive re-capture, recurring re-sync, or material provider disagreement.
- Capture only public HTTP/HTTPS pages.
- Block private, loopback, link-local, multicast, and cloud-metadata addresses before the first request and after every redirect.
- Stop at authentication, paywall, or interactive CAPTCHA boundaries.
- Never log cookies, authorization headers, proxy credentials, internal tokens, or persistent-profile contents.
- Cap page count, redirects, response size, timeout, and per-domain concurrency.

---

### Task 1: Define Reference Contracts and URL Safety Policy

**Files:**
- Create: `lib/reference/contracts.ts`
- Create: `lib/reference/policy/url-policy.ts`
- Create: `lib/reference/policy/block-signals.ts`
- Create: `tests/reference/url-policy.test.ts`
- Create: `tests/reference/reference-contracts.test.ts`

**Interfaces:**
- Consumes: Node DNS APIs and Zod.
- Produces: `ReferenceCaptureRequestSchema`, `ReferenceBundleSchema`, `ReferenceCaptureResultSchema`, `assertPublicCaptureUrl`, and `detectBlockSignals`.

- [ ] **Step 1: Write SSRF and block-signal tests**

```ts
// tests/reference/url-policy.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicCaptureUrl } from "../../lib/reference/policy/url-policy";

test("capture policy rejects loopback and cloud metadata targets", async () => {
  await assert.rejects(() => assertPublicCaptureUrl("http://127.0.0.1/admin"));
  await assert.rejects(() => assertPublicCaptureUrl("http://169.254.169.254/latest/meta-data"));
});

test("capture policy accepts a public HTTPS target", async () => {
  await assert.doesNotReject(() => assertPublicCaptureUrl("https://example.com", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  }));
});
```

```ts
test("challenge markup produces a typed block signal", () => {
  const signals = detectBlockSignals({ status: 403, html: "<title>Just a moment...</title>", url: "https://example.com" });
  assert.ok(signals.some((signal) => signal.code === "challenge-page"));
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/reference/url-policy.test.ts tests/reference/reference-contracts.test.ts
```

Expected: FAIL because the policy and contracts do not exist.

- [ ] **Step 3: Implement contracts and public-address checks**

The request schema includes explicit viewports and policy flags:

```ts
export const ReferenceCaptureRequestSchema = z.object({
  projectId: z.string().min(1),
  generationId: z.string().uuid(),
  url: z.string().url(),
  purpose: z.enum(["clone", "inspiration", "resync"]),
  viewports: z.array(z.object({
    name: z.enum(["desktop", "mobile"]),
    width: z.number().int().min(320).max(2560),
    height: z.number().int().min(480).max(2000),
  })).min(2),
  maxPages: z.number().int().min(1).max(20).default(1),
  refresh: z.boolean().default(false),
  allowSelfHostedFallback: z.boolean().default(true),
  allowStealthEscalation: z.boolean().default(false),
});
```

Resolve all A/AAAA records and reject Node `net.BlockList` ranges for loopback, RFC1918, link-local, unique-local IPv6, multicast, unspecified, and metadata addresses. Re-run the policy on every redirect URL supplied by a provider.

`detectBlockSignals` returns typed codes: `http-403`, `http-429`, `challenge-page`, `redirect-loop`, `empty-spa-shell`, `automation-rejected`, `auth-wall`, `paywall`, and `interactive-captcha`.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npx tsx --test tests/reference/url-policy.test.ts tests/reference/reference-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/reference/contracts.ts lib/reference/policy tests/reference/url-policy.test.ts tests/reference/reference-contracts.test.ts
git commit -m "feat: define safe reference capture contracts"
```

### Task 2: Add Durable Reference Artifact Storage

**Files:**
- Modify: `scripts/migrate-db.ts`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `.gitignore`
- Create: `lib/artifacts/contracts.ts`
- Create: `lib/artifacts/file-artifact-store.ts`
- Create: `lib/reference/repository.ts`
- Create: `tests/integration/reference-repository.test.ts`

**Interfaces:**
- Consumes: generation and project IDs.
- Produces: `ArtifactStore.put/get/delete`, `createReferenceCapture`, `saveReferenceBundle`, and `getLatestReferenceBundle`.

- [ ] **Step 1: Write persistence tests**

```ts
test("reference screenshots survive a repository round trip", async () => {
  const capture = await createReferenceCapture({
    id: randomUUID(),
    projectId,
    generationId,
    sourceUrl: "https://example.com",
    provider: "firecrawl",
  });
  const stored = await store.put({
    key: `${capture.id}/desktop.png`,
    contentType: "image/png",
    bytes: Buffer.from("png"),
  });
  await saveReferenceBundle(capture.id, { ...bundleFixture, desktopScreenshot: stored });
  assert.equal((await getLatestReferenceBundle(projectId))?.desktopScreenshot.key, stored.key);
});
```

- [ ] **Step 2: Run migration/test and verify failure**

Run:

```powershell
npx tsx scripts/migrate-db.ts
npx tsx --test tests/integration/reference-repository.test.ts
```

Expected: FAIL because reference tables and artifact store do not exist.

- [ ] **Step 3: Add storage and tables**

Add an `artifacts` Docker volume mounted at `/app/storage` and `ARTIFACT_ROOT=/app/storage` in Docker; local default is `<repo>/storage`.

Add `storage/**` to `.gitignore`; benchmark fixtures belong under `tests/fixtures/` and are the only reference artifacts committed to Git.

Add tables:

```sql
CREATE TABLE IF NOT EXISTS reference_captures (
  id UUID PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  provider VARCHAR(30) NOT NULL,
  browser_engine VARCHAR(30),
  decision_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_json JSONB,
  bundle_json JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS adaptive_snapshots (
  id UUID PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  selector_key TEXT NOT NULL,
  selector_state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, source_url, selector_key)
);
```

`FileArtifactStore.put` writes to a generated temporary file in the same directory and atomically renames it. Reject keys containing `..`, drive letters, or leading slashes.

- [ ] **Step 4: Run migration and tests**

Run:

```powershell
npx tsx scripts/migrate-db.ts
npx tsx --test tests/integration/reference-repository.test.ts
```

Expected: PASS and idempotent migration.

- [ ] **Step 5: Commit**

```powershell
git add scripts/migrate-db.ts docker-compose.yml .env.example .gitignore lib/artifacts lib/reference/repository.ts tests/integration/reference-repository.test.ts
git commit -m "feat: persist reference capture artifacts"
```

### Task 3: Implement the Firecrawl v2 Provider

**Files:**
- Create: `lib/reference/providers/firecrawl-provider.ts`
- Create: `lib/reference/providers/firecrawl-mapper.ts`
- Replace through delegation: `app/api/scrape-url-enhanced/route.ts:1-127`
- Replace through delegation: `app/api/scrape-screenshot/route.ts:1-75`
- Replace through delegation: `app/api/scrape-website/route.ts`
- Replace through delegation: `app/api/extract-brand-styles/route.ts`
- Modify: `app/api/search/route.ts` to use Firecrawl v2 search with the same public response contract.
- Create: `tests/reference/firecrawl-provider.test.ts`
- Create: `tests/fixtures/reference/firecrawl-v2-response.json`

**Interfaces:**
- Consumes: `ReferenceCaptureRequest`, `FIRECRAWL_API_KEY`, artifact store.
- Produces: `FirecrawlReferenceProvider.capture()` returning `ReferenceCaptureResult`.

- [ ] **Step 1: Write a fixture replay test**

```ts
test("Firecrawl maps desktop and mobile captures into one bundle", async () => {
  const provider = new FirecrawlReferenceProvider({
    fetchImpl: createFixtureFetch("tests/fixtures/reference/firecrawl-v2-response.json"),
    artifactStore,
  });
  const result = await provider.capture(requestFixture);
  assert.equal(result.decision.providerId, "firecrawl");
  assert.equal(result.bundle.desktopScreenshot.width, 1440);
  assert.equal(result.bundle.mobileScreenshot.width, 390);
  assert.ok(result.bundle.html.includes("<main"));
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/reference/firecrawl-provider.test.ts
```

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement v2 requests**

Issue separate desktop and mobile `POST https://api.firecrawl.dev/v2/scrape` calls so each screenshot has an explicit viewport. Request `markdown`, `html`, `links`, `attributes`, JSON extraction, and full-page screenshot. Set `mobile: true` for the mobile request.

```ts
const formats = [
  "markdown",
  "html",
  "links",
  { type: "attributes", selectors: [{ selector: "a", attribute: "href" }] },
  { type: "json", schema: ReferenceExtractionJsonSchema },
  { type: "screenshot", fullPage: true, quality: 80, viewport },
];
```

Define `ReferenceExtractionJsonSchema` as a checked-in JSON Schema constant beside the Zod response schema; do not call a Zod 4-only conversion method while the project remains on Zod 3.25.76.

Persist screenshot bytes through the artifact store and return references, never base64 image bodies in generation records. On partial success, return warnings and confidence; do not manufacture missing HTML.

Delegate the legacy scrape, screenshot, website, and brand-style routes to this provider with their existing response shapes until Wave 5. Move `app/api/search/route.ts` from `/v1/search` to `/v2/search` and validate its response before returning results.

- [ ] **Step 4: Run fixture tests**

Run:

```powershell
npx tsx --test tests/reference/firecrawl-provider.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/reference/providers/firecrawl-provider.ts lib/reference/providers/firecrawl-mapper.ts app/api/scrape-url-enhanced app/api/scrape-screenshot app/api/scrape-website app/api/extract-brand-styles app/api/search tests/reference/firecrawl-provider.test.ts tests/fixtures/reference/firecrawl-v2-response.json
git commit -m "feat: capture references with Firecrawl v2"
```

### Task 4: Scaffold the Crawlee Capture Worker

**Files:**
- Create: `services/capture-worker/package.json`
- Create: `services/capture-worker/package-lock.json`
- Create: `services/capture-worker/tsconfig.json`
- Create: `services/capture-worker/Dockerfile`
- Create: `services/capture-worker/src/contracts.ts`
- Create: `services/capture-worker/src/server.ts`
- Create: `services/capture-worker/src/token.ts`
- Create: `services/capture-worker/test/server.test.ts`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: internal `CAPTURE_WORKER_TOKEN` and JSON capture requests.
- Produces: internal `POST /capture`, `GET /health`, and typed worker responses.

- [ ] **Step 1: Write worker authentication tests**

```ts
test("capture worker rejects a missing internal token", async () => {
  const response = await requestWorker({ path: "/capture", body: requestFixture, token: null });
  assert.equal(response.status, 401);
});

test("health endpoint does not expose secrets", async () => {
  const response = await requestWorker({ path: "/health" });
  assert.deepEqual(response.json, { ok: true });
});
```

- [ ] **Step 2: Run worker tests and verify failure**

Run:

```powershell
npm --prefix services/capture-worker test
```

Expected: FAIL because the worker package does not exist.

- [ ] **Step 3: Create the isolated worker**

Pin dependencies in the worker package:

```json
{
  "type": "module",
  "scripts": { "test": "tsx --test test/**/*.test.ts", "start": "tsx src/server.ts" },
  "dependencies": {
    "cloakbrowser": "0.4.10",
    "crawlee": "3.17.0",
    "zod": "3.25.76"
  },
  "devDependencies": { "tsx": "4.23.1", "typescript": "5.8.3" }
}
```

Use a Debian slim Node 20 image, not Alpine. Run as a non-root user, expose only the internal Compose network, set a read-only root filesystem where browser cache mounts permit, and apply memory/CPU limits. Generate and commit the worker lockfile with `npm --prefix services/capture-worker install --package-lock-only` before the image build.

Use Node `http.createServer`; parse at most 1 MB of JSON and compare `X-GStudio-Worker-Token` with `timingSafeEqual`.

- [ ] **Step 4: Build and test worker**

Run:

```powershell
npm --prefix services/capture-worker install
npm --prefix services/capture-worker test
docker compose build capture-worker
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add services/capture-worker docker-compose.yml .env.example
git commit -m "feat: add isolated reference capture worker"
```

### Task 5: Implement Crawlee Static and Playwright Capture

**Files:**
- Create: `services/capture-worker/src/crawlee-capture.ts`
- Create: `services/capture-worker/src/layout-evidence.ts`
- Modify: `services/capture-worker/src/server.ts`
- Create: `services/capture-worker/test/crawlee-capture.test.ts`
- Create: `lib/reference/providers/crawlee-provider.ts`
- Create: `tests/reference/crawlee-provider.test.ts`

**Interfaces:**
- Consumes: worker request, URL policy approval, viewports.
- Produces: `captureWithCrawlee`, worker response, and web-side `CrawleeReferenceProvider`.

- [ ] **Step 1: Write controlled-site tests**

Create a local fixture server with `/static`, `/spa`, and `/blocked` pages. Assert static capture uses the HTTP path, SPA capture uses Playwright, and both return landmark/layout evidence.

```ts
assert.equal(staticResult.capturePath, "http");
assert.equal(spaResult.capturePath, "playwright");
assert.deepEqual(spaResult.layout.landmarks.map((item) => item.tag), ["header", "main", "footer"]);
```

- [ ] **Step 2: Run worker/provider tests and verify failure**

Run:

```powershell
npm --prefix services/capture-worker test
npx tsx --test tests/reference/crawlee-provider.test.ts
```

Expected: FAIL because capture implementation and client do not exist.

- [ ] **Step 3: Implement two Crawlee paths**

Use `CheerioCrawler` for the first static attempt with `maxRequestsPerCrawl` from `maxPages`, request timeout, session pool, proxy configuration, and bounded retries. Detect JavaScript shells from low visible content plus script/root evidence, then use `PlaywrightCrawler`.

In Playwright capture:

```ts
await page.setViewportSize(viewport);
await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
await page.evaluate(() => document.fonts.ready);
const screenshot = await page.screenshot({ fullPage: true, type: "png", animations: "disabled" });
const html = await page.content();
```

Extract layout evidence in-page from landmarks, headings, repeated siblings, bounding boxes, computed font styles, colors, display, grid, and flex properties. Do not return cookies or storage state.

The web-side provider calls the internal worker with a 60-second abort timeout, validates the response schema, persists screenshots, and maps it to `ReferenceBundle`.

- [ ] **Step 4: Run tests**

Run:

```powershell
npm --prefix services/capture-worker test
npx tsx --test tests/reference/crawlee-provider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add services/capture-worker/src services/capture-worker/test lib/reference/providers/crawlee-provider.ts tests/reference/crawlee-provider.test.ts
git commit -m "feat: capture references with Crawlee"
```

### Task 6: Add Typed CloakBrowser Escalation

**Files:**
- Create: `services/capture-worker/src/cloak-capture.ts`
- Create: `services/capture-worker/src/escalation-policy.ts`
- Modify: `services/capture-worker/src/crawlee-capture.ts`
- Create: `services/capture-worker/test/cloak-escalation.test.ts`

**Interfaces:**
- Consumes: standard Crawlee result and typed block signals.
- Produces: one optional CloakBrowser capture with `browserEngine: "cloakbrowser"` and an escalation audit record.

- [ ] **Step 1: Write bounded-escalation tests**

```ts
test("CloakBrowser runs once after an eligible block signal", async () => {
  const calls: string[] = [];
  const result = await captureWithEscalation(requestFixture, {
    playwright: async () => blockedResult("http-403"),
    cloak: async () => { calls.push("cloak"); return successResult(); },
  });
  assert.deepEqual(calls, ["cloak"]);
  assert.equal(result.browserEngine, "cloakbrowser");
});

test("auth walls never escalate", async () => {
  const deps = fakeCaptureDeps(blockedResult("auth-wall"));
  await assert.rejects(() => captureWithEscalation(requestFixture, deps), /policy-terminal/);
  assert.equal(deps.cloakCalls, 0);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm --prefix services/capture-worker test
```

Expected: FAIL because escalation does not exist.

- [ ] **Step 3: Implement CloakBrowser capture**

```ts
const context = await launchContext({
  headless: true,
  proxy: request.proxy ?? undefined,
  viewport: request.viewport,
  locale: request.locale,
  timezone: request.timezone,
  humanize: true,
});
try {
  const page = await context.newPage();
  await page.goto(request.url, { waitUntil: "networkidle", timeout: request.timeoutMs });
  return await collectPageEvidence(page, "cloakbrowser");
} finally {
  await context.close();
}
```

Only signals `http-403`, `http-429`, `challenge-page`, `empty-spa-shell`, or `automation-rejected` are eligible. `auth-wall`, `paywall`, and `interactive-captcha` are terminal. An escalation result cannot recursively call the policy again.

- [ ] **Step 4: Run worker tests**

Run:

```powershell
npm --prefix services/capture-worker test
```

Expected: PASS and exactly one Cloak call in the eligible fixture.

- [ ] **Step 5: Commit**

```powershell
git add services/capture-worker/src services/capture-worker/test/cloak-escalation.test.ts
git commit -m "feat: add bounded CloakBrowser escalation"
```

### Task 7: Add the Scrapling Adaptive Sidecar

**Files:**
- Create: `services/scrapling-worker/requirements.txt`
- Create: `services/scrapling-worker/Dockerfile`
- Create: `services/scrapling-worker/app/models.py`
- Create: `services/scrapling-worker/app/security.py`
- Create: `services/scrapling-worker/app/capture.py`
- Create: `services/scrapling-worker/app/main.py`
- Create: `services/scrapling-worker/tests/test_api.py`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: internal token and public URL request.
- Produces: `POST /capture`, `POST /extract`, and `POST /adaptive-recapture` on the internal network.

- [ ] **Step 1: Write FastAPI contract tests**

```python
def test_capture_requires_internal_token(client):
    response = client.post("/capture", json={"url": "https://example.com", "profile": "http"})
    assert response.status_code == 401

def test_adaptive_recap_returns_match_confidence(client, monkeypatch):
    monkeypatch.setattr("app.capture.adaptive_recap", lambda request: {
        "selector_key": request.selector_key,
        "html": "<h1>Example</h1>",
        "confidence": 0.91,
    })
    response = client.post(
        "/adaptive-recapture",
        headers={"X-GStudio-Worker-Token": "test-token"},
        json={"url": "https://example.com", "selector_key": "hero-title", "selector": "h1"},
    )
    assert response.status_code == 200
    assert response.json()["confidence"] == 0.91
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
docker compose run --rm scrapling-worker pytest -q
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the sidecar**

Pin:

```text
fastapi==0.128.0
httpx==0.28.1
pydantic==2.13.4
pytest==9.1.1
scrapling==0.4.11
uvicorn==0.51.0
```

Use `Fetcher.get` for `http`, `DynamicFetcher.fetch` for `dynamic`, and `StealthyFetcher.fetch` only when the router explicitly requests `stealth`. The API validates the internal token with constant-time comparison and caps timeout, response bytes, redirects, and concurrency.

For initial adaptive storage:

```python
page = Fetcher.get(request.url, timeout=request.timeout_seconds)
elements = page.css(request.selector, auto_save=request.save_selector)
```

For re-capture:

```python
elements = page.css(request.selector, adaptive=True)
```

Return HTML, visible text, links, source fingerprint, selector key, and confidence. Never return cookies, request headers, or proxy credentials.

- [ ] **Step 4: Build and test sidecar**

Run:

```powershell
docker compose build scrapling-worker
docker compose run --rm -e SCRAPLING_WORKER_TOKEN=test-token scrapling-worker pytest -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add services/scrapling-worker docker-compose.yml .env.example
git commit -m "feat: add Scrapling adaptive capture service"
```

### Task 8: Implement Capture Routing, Confidence, and Generation Integration

**Files:**
- Create: `lib/reference/providers/scrapling-provider.ts`
- Create: `lib/reference/policy/capture-router.ts`
- Create: `lib/reference/normalize/layout-normalizer.ts`
- Create: `lib/reference/normalize/confidence.ts`
- Create: `lib/reference/capture/capture-reference.ts`
- Modify: `lib/generation/orchestration/generation-orchestrator.ts`
- Modify: `lib/generation/planning/messages.ts`
- Create: `tests/reference/capture-router.test.ts`
- Create: `tests/integration/clone-planning-images.test.ts`

**Interfaces:**
- Consumes: all three providers, block signals, artifact store, reference repository.
- Produces: `captureReference`, `calculateCaptureConfidence`, normalized `ReferenceBundle`, and actual desktop/mobile image parts for clone planning.

- [ ] **Step 1: Write routing and multimodal tests**

```ts
test("router uses Firecrawl without speculative fallbacks", async () => {
  const deps = successfulFirecrawlDeps();
  const result = await captureReference(requestFixture, deps);
  assert.equal(result.decision.providerId, "firecrawl");
  assert.equal(deps.crawleeCalls, 0);
  assert.equal(deps.scraplingCalls, 0);
});

test("clone planning receives screenshot image parts", async () => {
  const messages = buildPlanningMessages({ mode: "clone", brief: cloneBrief, reference: bundleFixture });
  const imageParts = messages.flatMap((message) => Array.isArray(message.content) ? message.content : []).filter((part) => part.type === "image");
  assert.equal(imageParts.length, 2);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/reference/capture-router.test.ts tests/integration/clone-planning-images.test.ts
```

Expected: FAIL because routing and image parts are not integrated.

- [ ] **Step 3: Implement evidence-based routing**

Routing sequence:

1. Validate URL.
2. Reuse a fresh cached bundle unless `refresh` is true.
3. Call Firecrawl.
4. If confidence is below the configured threshold and self-hosted fallback is allowed, call Crawlee standard capture.
5. Let the Crawlee worker make its single Cloak escalation decision.
6. Call Scrapling only for `resync` purpose or material normalized-structure disagreement.
7. Persist every attempt and final decision.

`buildPlanningMessages` reads artifact bytes and supplies them as AI SDK image parts. It does not embed base64 inside the textual prompt.

- [ ] **Step 4: Run Wave 3 verification**

Run:

```powershell
npm run test:reference
npx tsx --test tests/integration/clone-planning-images.test.ts
npm --prefix services/capture-worker test
docker compose run --rm -e SCRAPLING_WORKER_TOKEN=test-token scrapling-worker pytest -q
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/reference lib/generation/orchestration/generation-orchestrator.ts lib/generation/planning/messages.ts tests/reference tests/integration/clone-planning-images.test.ts
git commit -m "feat: route multimodal reference captures"
```

## Wave 3 Completion Check

Run:

```powershell
rg -n "api\.firecrawl\.dev/v1" app lib
npm run test:reference
docker compose build capture-worker scrapling-worker
```

Expected: no active v1 Firecrawl route remains; reference tests and worker builds pass.
