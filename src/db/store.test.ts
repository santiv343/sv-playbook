import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { openStore, worktreeRoot } from './store.js';
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
  assert.throws(() => openStore(root), /restore a compatible state backup/);
  const store = openStore(root, { skipVersionCheck: true });
  store.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  store.close();
  const reopened = openStore(root);
  assert.equal(numberColumn(reopened.db.prepare('PRAGMA user_version').get(), 'user_version'), SCHEMA_VERSION);
  reopened.close();
});

test('packets store has a body column and a packet_deps table at the bumped schema version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-bodydeps-'));
  const store = openStore(root);
  const bodyRow = store.db
    .prepare("PRAGMA table_info(packets)")
    .all()
    .find((row: Record<string, unknown>) => stringColumn(row, 'name') === 'body');
  assert.ok(bodyRow, 'packets table must have a body column');
  const depsTable = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='packet_deps'")
    .get();
  assert.ok(depsTable, 'packet_deps table must exist');
  const version = numberColumn(
    store.db.prepare('PRAGMA user_version').get(),
    'user_version',
  );
  assert.equal(version, 3, 'schema version must be bumped to 3');
  store.close();
});
