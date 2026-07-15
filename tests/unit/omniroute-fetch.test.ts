import assert from "node:assert/strict";
import test from "node:test";

import { createOmniRouteFetch } from "../../lib/ai/provider-manager";

test("OmniRoute fetch explicitly requests JSON for non-stream chat completions", async () => {
  let capturedBody = "";
  const fetch = createOmniRouteFetch(async (_input, init) => {
    capturedBody = String(init?.body);
    return new Response("{}", { status: 200 });
  });

  await fetch("https://omniroute.tr4.net/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "auto/best-reasoning", messages: [] }),
  });

  assert.deepEqual(JSON.parse(capturedBody), {
    model: "auto/best-reasoning",
    messages: [],
    stream: false,
  });
});

test("OmniRoute fetch preserves explicit streaming requests", async () => {
  let capturedBody = "";
  const fetch = createOmniRouteFetch(async (_input, init) => {
    capturedBody = String(init?.body);
    return new Response("{}", { status: 200 });
  });

  await fetch("https://omniroute.tr4.net/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "auto/best-coding", messages: [], stream: true }),
  });

  assert.deepEqual(JSON.parse(capturedBody), {
    model: "auto/best-coding",
    messages: [],
    stream: true,
  });
});
