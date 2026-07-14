import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationProgressSurface } from "../../components/generation/GenerationProgressSurface";

test("renders an accessible active build stage without a terminal claim", () => {
  const markup = renderToStaticMarkup(
    <GenerationProgressSurface
      phase="build"
      status="Writing React components"
      detail="Preparing the candidate for application"
      targetLabel="businesswire.com"
    />,
  );

  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /Writing React components/);
  assert.match(markup, /Workspace/);
  assert.match(markup, /Verify/);
  assert.doesNotMatch(markup, /Generation complete/i);
});

test("exposes all phases and maps verify to the terminal rail position", () => {
  const markup = renderToStaticMarkup(
    <GenerationProgressSurface phase="verify" status="Running quality checks" />,
  );

  assert.match(markup, /aria-valuenow="100"/);
  assert.match(markup, /data-phase="verify"/);
});
