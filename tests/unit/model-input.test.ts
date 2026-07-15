import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeGenerationModelInput } from "../../lib/generation/context/model-input";

test("sanitizes secrets and filesystem paths before generation data reaches a model", () => {
  const environmentKey = "GSTUDIO_MODEL_INPUT_TEST_SECRET";
  const originalValue = process.env[environmentKey];
  const secret = "model-input-secret-987654";
  process.env[environmentKey] = secret;

  try {
    const sanitized = sanitizeGenerationModelInput({
      prompt: `Build the project using ${secret}`,
      context: {
        nested: {
          apiKey: "live-api-key-123456",
          posixPath: "/Users/example/private-project",
          windowsPath: "C:\\Users\\example\\private-project",
          source: `const credential = "${secret}";`,
          project: "Seedling",
        },
      },
    });

    const nested = sanitized.context as Record<string, Record<string, unknown>>;
    const serialized = JSON.stringify(sanitized);
    assert.equal(sanitized.prompt, "[redacted]");
    assert.equal(nested.nested.apiKey, undefined);
    assert.equal(nested.nested.posixPath, "[redacted]");
    assert.equal(nested.nested.windowsPath, "[redacted]");
    assert.equal(nested.nested.source, "[redacted]");
    assert.equal(nested.nested.project, "Seedling");
    assert.doesNotMatch(serialized, new RegExp(secret));
    assert.doesNotMatch(serialized, /\/Users\/example\/private-project/);
    assert.doesNotMatch(serialized, /C:\\Users\\example\\private-project/);

    const benign = sanitizeGenerationModelInput({
      prompt: "Build a garden guide.",
      context: { project: "Seedling" },
    });
    assert.equal(benign.prompt, "Build a garden guide.");
    assert.deepEqual(benign.context, { project: "Seedling" });
  } finally {
    if (originalValue === undefined) {
      delete process.env[environmentKey];
    } else {
      process.env[environmentKey] = originalValue;
    }
  }
});

test("removes absolute currentFiles map keys and values while preserving relative paths", () => {
  const windowsPath = "C:\\Users\\reviewer\\private-project\\App.tsx";
  const posixPath = "/Users/reviewer/private-project/src/styles.css";
  const rootedWindowsPath = "\\Users\\reviewer\\private-project\\Rooted.tsx";
  const uncPath = "//server/share/private-project/Share.tsx";
  const dotRelativePath = "./src/preview.tsx";
  const parentRelativePath = "../shared/button.tsx";
  const sanitized = sanitizeGenerationModelInput({
    prompt: "Fix the existing application.",
    context: {
      currentFiles: {
        [windowsPath]: "export default function App() { return null; }",
        [posixPath]: "body { margin: 0; }",
        [rootedWindowsPath]: "export default function Rooted() { return null; }",
        [uncPath]: "export default function Share() { return null; }",
        "src/main.tsx": 'const configPath = "/Users/reviewer/private-project/config.json";',
        [dotRelativePath]: "export default function Preview() { return null; }",
        [parentRelativePath]: "export const button = true;",
      },
    },
  });

  const context = sanitized.context as {
    currentFiles: Record<string, string>;
  };
  const serialized = JSON.stringify(sanitized);

  assert.deepEqual(context.currentFiles, {
    "src/main.tsx": "[redacted]",
    [dotRelativePath]: "export default function Preview() { return null; }",
    [parentRelativePath]: "export const button = true;",
  });
  assert.doesNotMatch(serialized, /C:\\Users\\reviewer\\private-project\\App\.tsx/);
  assert.doesNotMatch(serialized, /\/Users\/reviewer\/private-project\/src\/styles\.css/);
  assert.doesNotMatch(serialized, /\\Users\\reviewer\\private-project\\Rooted\.tsx/);
  assert.doesNotMatch(serialized, /\/\/server\/share\/private-project\/Share\.tsx/);
  assert.doesNotMatch(serialized, /\/Users\/reviewer\/private-project\/config\.json/);
});

test("preserves slash-separated prose in generation prompts", () => {
  const sanitized = sanitizeGenerationModelInput({
    prompt: "Use the DESIGN PREFERENCE / STYLE: Minimalist direction.",
    context: {},
  });

  assert.equal(
    sanitized.prompt,
    "Use the DESIGN PREFERENCE / STYLE: Minimalist direction.",
  );
});
