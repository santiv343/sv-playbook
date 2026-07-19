import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from './store.js';
import {
  STORE_INITIAL_SCHEMA_VERSION,
  STORE_MIGRATION_IDS,
} from './store.migration-manifest.constants.js';
import { EVENT_AMEND_ACTIVE } from '../tasks/service.constants.js';

test('event-commands-5 migration adds EVENT_AMEND_ACTIVE to events CHECK', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-event-cmds-5-'));
  const store = openStore(root);
  store.close();

  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const database = new DatabaseSync(dbPath);

  const oldCommands = ['transition', 'note', 'takeover', 'evidence', 'imported', 'schema-migrated'];
  const oldCheck = oldCommands.map((v) => `'${v}'`).join(', ');
  database.exec('DROP TABLE events');
  database.exec(`CREATE TABLE events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    packet_id TEXT,
    command TEXT NOT NULL CHECK (command IN (${oldCheck})),
    detail TEXT,
    at TEXT NOT NULL
  )`);

  const idx = STORE_MIGRATION_IDS.indexOf('event-commands-4') + 1;
  const versionBefore = STORE_INITIAL_SCHEMA_VERSION + idx;
  database.exec(`PRAGMA user_version = ${versionBefore}`);
  database.close();

  const migrated = openStore(root);
  migrated.db.prepare('INSERT INTO events (command, at) VALUES (?, ?)').run(EVENT_AMEND_ACTIVE, new Date().toISOString());
  migrated.close();
});
