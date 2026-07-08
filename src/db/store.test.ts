import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore, SCHEMA_VERSION } from './store.js';
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

test('schema version mismatch refuses with the rebuild recovery message', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-ver-'));
  openStore(root).close();
  const db = new DatabaseSync(join(root, '.svp', 'playbook.sqlite'));
  db.exec('PRAGMA user_version = 1');
  db.close();
  assert.throws(() => openStore(root), /run sv-playbook rebuild/);
  const store = openStore(root, { skipVersionCheck: true });
  store.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  store.close();
  const reopened = openStore(root);
  assert.equal(numberColumn(reopened.db.prepare('PRAGMA user_version').get(), 'user_version'), SCHEMA_VERSION);
  reopened.close();
});
