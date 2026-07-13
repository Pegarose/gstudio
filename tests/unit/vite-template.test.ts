import assert from 'node:assert/strict';
import test from 'node:test';
import { viteReactTemplate } from '../../lib/sandbox/templates/vite-react';

test('shared Vite template pins the required React, Vite, and Tailwind versions', () => {
  assert.equal(viteReactTemplate.packageJson.dependencies.react, '19.1.0');
  assert.equal(viteReactTemplate.packageJson.dependencies['react-dom'], '19.1.0');
  assert.equal(viteReactTemplate.packageJson.devDependencies.vite, '7.3.6');
  assert.equal(viteReactTemplate.packageJson.devDependencies['@vitejs/plugin-react'], '5.2.0');
  assert.equal(viteReactTemplate.packageJson.devDependencies.tailwindcss, '3.4.19');
});

