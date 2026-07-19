import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OS_PLATFORM } from '../platform.constants.js';
import { repoId, resolveStoreRoot } from './store-location.js';
import { openStore, commonRoot } from './store.js';
import { initTestRepo } from '../testkit.js';

test('repoId is deterministic for the same input', () => {
  assert.equal(repoId('C:/Users/santi/Desktop/projects/sv-playbook'), repoId('C:/Users/santi/Desktop/projects/sv-playbook'));
});

test('repoId differs for different repos', () => {
  assert.notEqual(repoId('C:/repo-a'), repoId('C:/repo-b'));
});

test('resolveStoreRoot on Windows uses LOCALAPPDATA', { skip: process.platform !== OS_PLATFORM.WINDOWS }, () => {
  const original = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = 'C:/Users/santi/AppData/Local';
  try {
    const result = resolveStoreRoot('C:/Users/santi/Desktop/projects/sv-playbook');
    assert.match(result, /AppData[\\/]Local[\\/]sv-playbook[\\/][0-9a-f]{16}$/);
  } finally {
    if (original === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = original;
  }
});

test('resolveStoreRoot on non-Windows uses XDG_DATA_HOME', { skip: process.platform === OS_PLATFORM.WINDOWS }, () => {
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = '/home/santi/.local/share';
  try {
    const result = resolveStoreRoot('/home/santi/projects/sv-playbook');
    assert.match(result, /\.local[\\/]share[\\/]sv-playbook[\\/][0-9a-f]{16}$/);
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

test('openStore creates the store outside the repo tree when the root is a git repo', () => {
  const root = mkdtempSync(join(tmpdir(), 'svp-store-external-'));
  initTestRepo(root);
  const store = openStore(root);
  const expectedDir = resolveStoreRoot(commonRoot(root));
  assert.equal(store.dir, expectedDir);
  assert.ok(!existsSync(join(root, '.svp', 'playbook.sqlite')), 'in-tree .svp/playbook.sqlite should not exist');
  store.close();
});
