import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { inventoryRepo } from './inventory.js';
import { initTestRepo } from '../testkit.js';

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

test('inventory detects AGENTS.md, git info, and pnpm workspace packages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-inventory-'));

  writeFileSync(join(dir, 'AGENTS.md'), '');

  const pkg = {
    name: 'test-pnpm-repo',
    scripts: {
      test: 'npm test',
    },
    devDependencies: {
      typescript: '^5',
    },
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));

  const pnpmWorkspace = "packages:\n  - 'apps/*'\n  - 'packages/*'\n";
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), pnpmWorkspace);

  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(dir, '.github', 'workflows', 'ci.yml'), '');

  initTestRepo(dir);
  execSync('git remote add origin git@github.com:test/repo.git', { cwd: dir });

  const report = inventoryRepo(dir);

  assert.equal(report.playbookArtifacts['AGENTS.md'], true);
  assert.equal(report.git.remoteUrl, 'git@github.com:test/repo.git');
  assert.ok(report.packages.includes('apps/*'));
  assert.ok(report.packages.includes('packages/*'));
  assert.ok(report.ci.workflows.includes('ci.yml'));
  assert.ok(report.stack.includes('typescript'));
  assert.ok(report.stack.includes('node'));
  assert.equal(report.verifyCommand, 'npm test');
});
