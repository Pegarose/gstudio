const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const dashboardSource = readFileSync(resolve(__dirname, '../app/page.tsx'), 'utf8');

test('dashboard only renders persisted projects', () => {
  assert.match(dashboardSource, /useState<Project\[\]>\(\[\]\)/);
  assert.doesNotMatch(dashboardSource, /Mock Workspace Projects/);
  assert.doesNotMatch(dashboardSource, /legacyProjectFixtures/);
  assert.doesNotMatch(dashboardSource, /prev\.forEach\(mock/);
});

test('project deletion keeps failed deletes visible and reports the error', () => {
  assert.match(dashboardSource, /if \(!response\.ok \|\| !data\.success\)/);
  assert.match(dashboardSource, /throw new Error\(data\.error/);
  assert.match(dashboardSource, /toast\.error\(`Failed to delete project:/);
});
