import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBrowser } from "../../lib/generation/validation/browser-validator";

const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sites");

let fixtureServer: Server;
let fixtureOrigin = "";

before(async () => {
  fixtureServer = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const fixtureName = pathname.slice(1);

    if (fixtureName === "runtime-error") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="en"><head><title>Runtime error fixture</title></head>
        <body><main><button type="button">Continue</button></main>
        <script>throw new Error("fixture runtime error")</script></body></html>`);
      return;
    }

    if (fixtureName === "a11y-error") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="en"><head><title>A11y error fixture</title></head>
        <body><main><button type="button"></button></main></body></html>`);
      return;
    }

    if (fixtureName === "a11y-narrow") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="en"><head><title>Narrow a11y fixture</title></head>
        <body><main><button type="button">Continue</button></main>
        <script>
          if (window.matchMedia("(max-width: 400px)").matches) {
            document.querySelector("button").textContent = "";
          }
        </script></body></html>`);
      return;
    }

    if (fixtureName === "no-focus") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="en"><head><title>No focus fixture</title>
        <style>
          button, button:focus, button:focus-visible {
            outline: none !important;
            box-shadow: none !important;
            border: 1px solid rgb(34, 34, 34) !important;
          }
        </style>
        </head><body><main><button type="button">Continue</button></main></body></html>`);
      return;
    }

    if (fixtureName === "infinite-motion") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="en"><head><title>Motion fixture</title>
        <style>@keyframes pulse { to { opacity: .5; } } main { animation: pulse 1s infinite; }</style>
        </head><body><main><button type="button">Continue</button></main></body></html>`);
      return;
    }

    if (fixtureName === "nested-infinite-motion") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="en"><head><title>Nested motion fixture</title>
        <style>@keyframes pulse { to { opacity: .5; } } main > div { animation: pulse 1s infinite; }</style>
        </head><body><main><div>Animated child</div><button type="button">Continue</button></main></body></html>`);
      return;
    }

    if (fixtureName === "hidden-focusable") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="en"><head><title>Hidden focus fixture</title>
        <style>button:focus-visible { outline: 3px solid #005fcc; outline-offset: 3px; }</style>
        </head><body><main><button type="button" hidden>Hidden menu item</button><button type="button">Continue</button></main></body></html>`);
      return;
    }

    if (fixtureName === "radio-group") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="en"><head><title>Radio focus fixture</title>
        <style>input:focus-visible { outline: 3px solid #005fcc; outline-offset: 3px; }</style>
        </head><body><main><fieldset><legend>Choose one</legend>
        <label><input type="radio" name="choice" value="one" checked /> One</label>
        <label><input type="radio" name="choice" value="two" /> Two</label>
        </fieldset></main></body></html>`);
      return;
    }

    if (fixtureName === "overflow" || fixtureName === "passing") {
      const fixture = await readFile(join(fixturesDirectory, fixtureName, "index.html"), "utf8");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(fixture);
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
  const address = fixtureServer.address();
  assert.ok(address && typeof address !== "string");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => fixtureServer.close((error) => (error ? reject(error) : resolve())));
});

test("browser validator detects horizontal overflow at 320px", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/overflow`, desktopWidth: 1440 });
  const mobile = report.responsive.find((item) => item.width === 320);

  assert.equal(mobile?.horizontalOverflow, true);
  assert.equal(mobile?.passed, false);
  assert.equal(report.passed, false);
});

test("browser validator captures page errors", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/runtime-error`, desktopWidth: 1440 });

  assert.equal(report.runtime.passed, false);
  assert.match(report.runtime.evidence, /fixture runtime error/);
});

test("browser validator passes runtime, responsiveness, keyboard, motion, and axe gates for a valid page", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/passing`, desktopWidth: 1440 });

  assert.equal(report.passed, true);
  assert.equal(report.runtime.passed, true);
  assert.equal(report.keyboard.passed, true);
  assert.equal(report.reducedMotion.passed, true);
  assert.equal(report.accessibility.passed, true);
  assert.deepEqual(report.responsive.map((item) => item.width), [320, 375, 414, 768, 1440]);
  assert.ok(report.responsive.every((item) => item.horizontalOverflow === false));
});

test("browser validator marks serious and critical axe violations as hard failures with selector evidence", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/a11y-error`, desktopWidth: 1440 });

  assert.equal(report.accessibility.passed, false);
  assert.match(report.accessibility.evidence, /button-name/);
  assert.match(report.accessibility.evidence, /critical/);
  assert.match(report.accessibility.evidence, /button/);
  assert.match(report.accessibility.evidence, /https?:\/\//);
});

test("browser validator runs Axe at every viewport and retains the failed width", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/a11y-narrow`, desktopWidth: 1440 });

  assert.equal(report.accessibility.passed, false);
  assert.match(report.accessibility.evidence, /320px: button-name \(critical\)/);
});

test("browser validator rejects pages with invisible keyboard focus", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/no-focus`, desktopWidth: 1440 });

  assert.equal(report.keyboard.passed, false, report.keyboard.evidence);
  assert.match(report.keyboard.evidence, /focus/i);
});

test("browser validator rejects primary content that ignores reduced motion", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/infinite-motion`, desktopWidth: 1440 });

  assert.equal(report.reducedMotion.passed, false);
  assert.match(report.reducedMotion.evidence, /infinite/i);
});

test("browser validator finds infinite animation within the primary-content subtree", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/nested-infinite-motion`, desktopWidth: 1440 });

  assert.equal(report.reducedMotion.passed, false);
  assert.match(report.reducedMotion.evidence, /infinite/i);
});

test("browser validator ignores hidden elements when traversing keyboard focus", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/hidden-focusable`, desktopWidth: 1440 });

  assert.equal(report.keyboard.passed, true, report.keyboard.evidence);
});

test("browser validator follows Chromium's single Tab stop for a same-name radio group", async () => {
  const report = await validateBrowser({ url: `${fixtureOrigin}/radio-group`, desktopWidth: 1440 });

  assert.equal(report.keyboard.passed, true, report.keyboard.evidence);
});
