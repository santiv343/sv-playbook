import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inventoryRepo } from './inventory.js';

test('inventory detects the verify command and monorepo packages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-inventory-'));

  const pkg = {
    name: 'test-monorepo',
    scripts: {
      test: 'jest --passWithNoTests',
      build: 'tsc',
    },
    workspaces: ['packages/foo', 'packages/bar', 'packages/baz'],
  };

  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));

  const report = inventoryRepo(dir);

  assert.equal(report.verifyCommand, 'jest --passWithNoTests');
  assert.deepEqual(report.packages, ['packages/foo', 'packages/bar', 'packages/baz']);
});
