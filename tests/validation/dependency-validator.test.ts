import assert from "node:assert/strict";
import test from "node:test";
import {
  PACKAGE_NAME,
  validateDependencies,
} from "../../lib/generation/validation/dependency-validator";

test("dependency validation rejects command and URL package strings", () => {
  assert.throws(
    () => validateDependencies(["react; rm -rf /"]),
    /invalid npm registry package/i,
  );
  assert.throws(
    () => validateDependencies(["https://example.com/pkg.tgz"]),
    /invalid npm registry package/i,
  );
});

test("dependency validation extracts bare imports and returns one validated install set", () => {
  const result = validateDependencies({
    artifact: {
      packages: ["lucide-react"],
      files: [{
        path: "src/App.tsx",
        content: [
          "import React from 'react';",
          "import { Sparkles } from 'lucide-react';",
          "import { helper } from './helper';",
          "export { createRoot } from 'react-dom/client';",
          "void import('lucide-react');",
        ].join("\n"),
      }],
    },
    templatePackageJson: {
      dependencies: {
        react: "19.1.0",
        "react-dom": "19.1.0",
      },
    },
    templateDependencies: ["react-dom"],
  });

  assert.deepEqual(result.imports, ["react", "lucide-react", "react-dom"]);
  assert.deepEqual(result.missingPackages, ["lucide-react"]);
});

test("dependency validation rejects undeclared bare imports", () => {
  assert.throws(
    () => validateDependencies({
      artifact: {
        packages: [],
        files: [{
          path: "src/App.tsx",
          content: "import { Sparkles } from 'lucide-react';",
        }],
      },
      templatePackageJson: { dependencies: { react: "19.1.0" } },
    }),
    /undeclared package imports: lucide-react/i,
  );
});

test("package-name policy accepts registry package names only", () => {
  assert.equal(PACKAGE_NAME.test("react"), true);
  assert.equal(PACKAGE_NAME.test("@radix-ui/react-dialog"), true);
  assert.equal(PACKAGE_NAME.test("file:../package"), false);
  assert.equal(PACKAGE_NAME.test("github:owner/repo"), false);
});
