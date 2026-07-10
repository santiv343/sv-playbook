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
import { randomUUID } from 'node:crypto';

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

test('packets store has a body column, a type column, and a packet_deps table at the bumped schema version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-body-'));
  const store = openStore(root);
  const cols = store.db
    .prepare('PRAGMA table_info(packets)')
    .all()
    .map((row) => stringColumn(row, 'name'));
  assert.ok(cols.includes('body'), 'packets table must have a body column');
  assert.ok(cols.includes('type'), 'packets table must have a type column');
  const deps = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='packet_deps'").all();
  assert.equal(deps.length, 1, 'packet_deps table must exist');
  const ver = numberColumn(store.db.prepare('PRAGMA user_version').get(), 'user_version');
  assert.equal(ver, SCHEMA_VERSION, `schema version must be ${SCHEMA_VERSION}`);
  store.close();
});

test('doctor flags a review packet whose PR is already merged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rev-merge-'));
  execFileSync('git', ['init'], { cwd: root });
  const store = openStore(root);

  store.db.prepare("INSERT INTO packets (id, title, path, status, body, write_set, pr, created_at, updated_at) VALUES ('P1', 'Test', '/tmp/test', 'review', '', '[]', '123', datetime('now'), datetime('now'))").run();

  const { reviewMergedCheckFromStore } = await import('../cli/commands/doctor.js');
  const result: { status: string; detail: string } = reviewMergedCheckFromStore(store);

  assert.notEqual(result.status, 'ok');
  assert.ok(result.detail.includes('already merged'), result.detail);

  store.close();
});

test('the store runs in WAL mode and two concurrent writers both commit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wal-'));
  execFileSync('git', ['init'], { cwd: root });
  const store = openStore(root);

  const sid1 = randomUUID();
  const sid2 = randomUUID();
  store.db.exec(`INSERT INTO sessions (id, worktree, started_at) VALUES ('${sid1}', '/tmp/wt1', datetime('now'))`);
  store.db.exec(`INSERT INTO sessions (id, worktree, started_at) VALUES ('${sid2}', '/tmp/wt2', datetime('now'))`);

  const modeRow = store.db.prepare('PRAGMA journal_mode').get();
  assert.equal(stringColumn(modeRow, 'journal_mode'), 'wal');

  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db2 = new DatabaseSync(dbPath);

  db2.exec(`INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('pk1', 'T1', '/tmp', 'draft', '[]', datetime('now'), datetime('now'))`);

  store.db.exec(`INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('pk2', 'T2', '/tmp', 'draft', '[]', datetime('now'), datetime('now'))`);

  const pk1 = store.db.prepare("SELECT id FROM packets WHERE id = 'pk1'").get();
  const pk2 = store.db.prepare("SELECT id FROM packets WHERE id = 'pk2'").get();
  assert.ok(pk1, 'writer 1 commit should be visible');
  assert.ok(pk2, 'writer 2 commit should be visible');

  db2.close();
  store.close();
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
