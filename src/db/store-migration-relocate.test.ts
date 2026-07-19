import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { relocateStoreIfNeeded } from './store-migration-relocate.js';
import { resolveStoreRoot } from './store-location.js';
import { DB_FILE, SVP_DIR } from './store.constants.js';

function tempRepo(): { repoRoot: string; commonRootPath: string; cleanup: () => void } {
  const repoRoot = mkdtempSync(join(tmpdir(), 'svp-relocate-'));
  const commonRootPath = mkdtempSync(join(tmpdir(), 'svp-common-'));
  return {
    repoRoot,
    commonRootPath,
    cleanup: () => {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(commonRootPath, { recursive: true, force: true });
    },
  };
}

test('moves an existing in-tree .svp/ to the external location', () => {
  const { repoRoot, commonRootPath, cleanup } = tempRepo();
  try {
    const inTreePath = join(repoRoot, SVP_DIR);
    mkdirSync(inTreePath, { recursive: true });
    writeFileSync(join(inTreePath, DB_FILE), 'sqlite data');

    relocateStoreIfNeeded(repoRoot, commonRootPath);

    const externalPath = resolveStoreRoot(commonRootPath);
    assert.equal(existsSync(inTreePath), true, 'in-tree .svp/ should be preserved for lock/token/session metadata');
    assert.equal(existsSync(join(externalPath, DB_FILE)), true, 'db should exist at external location');
  } finally {
    cleanup();
  }
});

test('is a no-op when the external location already has a store', () => {
  const { repoRoot, commonRootPath, cleanup } = tempRepo();
  try {
    const inTreePath = join(repoRoot, SVP_DIR);
    mkdirSync(inTreePath, { recursive: true });
    writeFileSync(join(inTreePath, DB_FILE), 'in-tree data');

    const externalPath = resolveStoreRoot(commonRootPath);
    mkdirSync(externalPath, { recursive: true });
    writeFileSync(join(externalPath, DB_FILE), 'external data');

    relocateStoreIfNeeded(repoRoot, commonRootPath);

    assert.equal(existsSync(inTreePath), true, 'in-tree .svp/ should be untouched');
    assert.equal(existsSync(join(externalPath, DB_FILE)), true, 'external db should still exist');
  } finally {
    cleanup();
  }
});

test('is a no-op when there is no in-tree .svp/ to migrate', () => {
  const { repoRoot, commonRootPath, cleanup } = tempRepo();
  try {
    relocateStoreIfNeeded(repoRoot, commonRootPath);

    const externalPath = resolveStoreRoot(commonRootPath);
    assert.equal(existsSync(externalPath), false, 'external location should not be created');
  } finally {
    cleanup();
  }
});
