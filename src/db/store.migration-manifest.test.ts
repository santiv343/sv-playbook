import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from './store.js';
import { numberColumn } from './rows.js';
import { SCHEMA_VERSION } from './store.constants.js';
import { STORE_INITIAL_SCHEMA_VERSION, STORE_MIGRATION_IDS } from './store.migration-manifest.constants.js';

test('schema version is derived from the ordered migration manifest', () => {
  assert.equal(SCHEMA_VERSION, STORE_INITIAL_SCHEMA_VERSION + STORE_MIGRATION_IDS.length);
});

test('schema migration runs every pending step in order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-mig-chain-'));
  openStore(root).close();
  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE role_escalation_routes (value TEXT)');
  db.exec('CREATE TABLE role_escalations (value TEXT)');
  db.exec('CREATE TABLE dispatch_sessions (value TEXT)');
  db.exec('PRAGMA user_version = 14');
  db.close();

  const store = openStore(root);
  const legacyTables = store.db.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN ('role_escalation_routes', 'role_escalations', 'dispatch_sessions')`).all();
  assert.deepEqual(legacyTables, []);
  assert.equal(numberColumn(store.db.prepare('PRAGMA user_version').get(), 'user_version'), SCHEMA_VERSION);
  store.close();
});
