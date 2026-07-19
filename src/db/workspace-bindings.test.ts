import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { bindWorkspace, openStore, resolveAndBindWorkspace, workspaceWithinRepo, resolveStoreDir } from './store.js';
import { DB_FILE, SCHEMA_VERSION } from './store.constants.js';
import { STORE_INITIAL_SCHEMA_VERSION, STORE_MIGRATION_ID, STORE_MIGRATION_IDS } from './store.migration-manifest.constants.js';
import { numberColumn, stringColumn } from './rows.js';
import { StoreVersionError } from './store.errors.js';
import type { Store } from './store.types.js';
import { initTestRepo } from '../testkit.js';

const BINDINGS_TABLE_SQL = "SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_bindings'";

function bindingTableExists(store: Store): boolean {
  return store.db.prepare(BINDINGS_TABLE_SQL).get() !== undefined;
}

function bindingRows(store: Store): Array<{ workspace: string; sessionId: string }> {
  return store.db.prepare('SELECT workspace, session_id FROM workspace_bindings').all()
    .map((row) => ({ workspace: stringColumn(row, 'workspace'), sessionId: stringColumn(row, 'session_id') }));
}

test('fresh stores create the workspace_bindings table', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wb-fresh-'));
  const store = openStore(root);
  assert.ok(bindingTableExists(store), 'workspace_bindings table must exist on a fresh store');
  store.close();
});

test('an aged store migrates to the workspace-bindings schema', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wb-aged-'));
  openStore(root).close();

  // Simulate a live store written before the binding table existed: drop the
  // table and rewind the schema version to just before the migration.
  const database = new DatabaseSync(join(resolveStoreDir(root), DB_FILE));
  database.exec('DROP TABLE IF EXISTS workspace_bindings');
  const versionBeforeBindings = STORE_INITIAL_SCHEMA_VERSION
    + STORE_MIGRATION_IDS.indexOf(STORE_MIGRATION_ID.WORKSPACE_BINDINGS);
  database.exec(`PRAGMA user_version = ${versionBeforeBindings}`);
  database.close();

  const migrated = openStore(root);
  assert.ok(bindingTableExists(migrated), 'migration must create the table on an aged store');
  assert.equal(numberColumn(migrated.db.prepare('PRAGMA user_version').get(), 'user_version'), SCHEMA_VERSION);
  migrated.close();
});

test('resolveAndBindWorkspace binds first use, resolves reuse, and rejects mismatches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wb-resolve-'));
  initTestRepo(root);
  const store = openStore(root);

  const first = resolveAndBindWorkspace(store, 'S-1', root);
  assert.equal(first.sessionId, 'S-1');
  const again = resolveAndBindWorkspace(store, 'S-1', root);
  assert.equal(again.sessionId, 'S-1');
  assert.equal(bindingRows(store).length, 1, 'first use creates exactly one binding');

  assert.throws(() => resolveAndBindWorkspace(store, 'S-2', root), StoreVersionError, 'mismatched claim must be rejected');
  assert.throws(() => resolveAndBindWorkspace(store, null, root), StoreVersionError, 'null claim against an existing binding must be rejected');
  assert.equal(bindingRows(store).length, 1, 'no mutation on rejection');

  const unbound = resolveAndBindWorkspace(store, null, join(root, 'other'));
  assert.equal(unbound.sessionId, '', 'null claim on an unbound workspace stays unbound');
  store.close();
});

test('canonical aliases resolve to the same workspace binding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wb-alias-'));
  initTestRepo(root);
  const sub = join(root, 'sub');
  await mkdir(sub);
  const store = openStore(root);

  resolveAndBindWorkspace(store, 'S-1', root);
  const alias = resolveAndBindWorkspace(store, 'S-1', sub);
  assert.equal(alias.sessionId, 'S-1');
  assert.equal(bindingRows(store).length, 1, 'aliases share one binding');
  assert.throws(() => resolveAndBindWorkspace(store, 'S-2', sub), StoreVersionError, 'mismatch through an alias must be rejected');
  store.close();
});

test('bindWorkspace is idempotent for the same session and refuses a second session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wb-bind-'));
  initTestRepo(root);
  const store = openStore(root);

  bindWorkspace(store, 'S-1', root);
  bindWorkspace(store, 'S-1', root);
  assert.throws(() => { bindWorkspace(store, 'S-2', root); }, StoreVersionError);
  const rows = bindingRows(store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.sessionId, 'S-1');
  store.close();
});

test('a claim naming a session that belongs to another workspace is rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wb-foreign-'));
  initTestRepo(root);
  const store = openStore(root);
  store.db.prepare('INSERT INTO sessions (id, worktree, started_at) VALUES (?, ?, ?)').run('S-9', join(root, 'elsewhere'), new Date().toISOString());

  assert.throws(() => resolveAndBindWorkspace(store, 'S-9', root), StoreVersionError, 'foreign session claim must be rejected');
  assert.equal(bindingRows(store).length, 0, 'no binding created for the foreign claim');
  store.close();
});

test('workspaceWithinRepo accepts the root, subdirectories, and linked worktrees', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wb-boundary-'));
  initTestRepo(root);
  const sub = join(root, 'sub');
  await mkdir(sub);

  assert.ok(workspaceWithinRepo(root, root), 'the repo root is inside the repository');
  assert.ok(workspaceWithinRepo(root, sub), 'a subdirectory is inside the repository');

  const linked = join(root, 'linked');
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
  execFileSync('git', ['branch', 'linked-b'], { cwd: root });
  execFileSync('git', ['worktree', 'add', linked, 'linked-b'], { cwd: root });
  assert.ok(workspaceWithinRepo(root, linked), 'a linked worktree belongs to the repository');

  const outside = await mkdtemp(join(tmpdir(), 'svp-wb-outside-'));
  initTestRepo(outside);
  assert.ok(!workspaceWithinRepo(root, outside), 'another repository is outside');
  assert.ok(!workspaceWithinRepo(root, join(tmpdir(), 'svp-wb-no-such-dir')), 'an unknown path is outside');
});
