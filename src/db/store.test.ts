import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { openStore, migrateStore, worktreeRoot } from './store.js';
import { SCHEMA_VERSION } from './store.constants.js';
import { numberColumn, stringColumn } from './rows.js';

test('openStore creates .svp/playbook.sqlite and the schema tables', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-store-'));
  const store = openStore(root);
  assert.ok(existsSync(join(root, '.svp', 'playbook.sqlite')));
  const tables = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((row) => stringColumn(row, 'name'));
  for (const t of ['events', 'leases', 'packets', 'sessions', 'transitions']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
  store.close();
});

test('openStore is idempotent (schema re-apply is safe)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-store2-'));
  openStore(root).close();
  const again = openStore(root);
  again.close();
});

test('worktreeRoot resolves the git working tree top-level', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wt-'));
  execFileSync('git', ['init'], { cwd: root });
  await writeFile(join(root, 'marker.txt'), 'x');
  assert.ok(existsSync(join(worktreeRoot(root), 'marker.txt')));
});

test('schema version mismatch refuses with the restore recovery message', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-ver-'));
  openStore(root).close();
  const db = new DatabaseSync(join(root, '.svp', 'playbook.sqlite'));
  db.exec('PRAGMA user_version = 1');
  db.close();
  assert.throws(() => openStore(root), /store unusable.*restore state.*rebuild/s);
  const store = openStore(root, { skipVersionCheck: true });
  store.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  store.close();
  const reopened = openStore(root);
  assert.equal(numberColumn(reopened.db.prepare('PRAGMA user_version').get(), 'user_version'), SCHEMA_VERSION);
  reopened.close();
});

test('a version mismatch refuses with a named non-destructive recovery and never deletes .svp', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rec-'));
  openStore(root).close();
  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version = 99');
  db.close();
  assert.throws(() => openStore(root), /restore state.*rebuild/s);
  assert.ok(existsSync(dbPath), '.svp/playbook.sqlite must still exist after mismatch');
});

test('schema migration refuses while a foreign live lease exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-mig-'));
  execFileSync('git', ['init'], { cwd: root });

  openStore(root).close();
  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version = 1');
  db.exec("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('p1', 'test', '/tmp/test', 'ready', '[]', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')");
  db.exec("INSERT INTO sessions (id, worktree, started_at) VALUES ('my-session', '/tmp/mine', '2025-01-01T00:00:00.000Z')");
  db.exec("INSERT INTO sessions (id, worktree, started_at) VALUES ('foreign-session', '/tmp/foreign', '2025-01-01T00:00:00.000Z')");
  db.exec("INSERT INTO leases (packet_id, session_id, worktree, acquired_at, heartbeat_at) VALUES ('p1', 'foreign-session', '/tmp/foreign', datetime('now'), datetime('now'))");
  db.close();

  assert.throws(
    () => { migrateStore(root, { currentSessionId: 'my-session' }); },
    /migration blocked:/,
  );
  const after = new DatabaseSync(dbPath);
  assert.equal(numberColumn(after.prepare('PRAGMA user_version').get(), 'user_version'), 1);
  after.close();
});
