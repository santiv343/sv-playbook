import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { generatePacketDocument } from '../packets/document.js';
import { WORK_DEFINITION_INITIAL_VERSION } from '../tasks/work-definition.constants.js';
import { parseWorkDefinitionReference, resolveWorkDefinition } from '../tasks/work-definitions.js';
import { openStore, resolveStoreDir } from './store.js';
import {
  STORE_INITIAL_SCHEMA_VERSION,
  STORE_MIGRATION_ID,
  STORE_MIGRATION_IDS,
} from './store.migration-manifest.constants.js';

test('the schema migration backfills version one from the legacy packet export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-work-definition-migration-'));
  const store = openStore(root);
  const definitionInput = {
    id: 'BUG-003', title: 'Legacy task', dependsOn: [], writeSet: ['src/**'],
    requirements: ['preserve this'], evidenceRequired: ['verify'], tags: ['migration'],
  };
  const body = 'Legacy body.';
  const mdPath = join(root, 'docs', 'packets', 'BUG-003.md');
  await mkdir(join(root, 'docs', 'packets'), { recursive: true });
  await writeFile(mdPath, generatePacketDocument(definitionInput, body), 'utf8');
  store.db.prepare(`INSERT INTO packets
    (id, title, path, status, body, write_set, type, created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?, 'bug', datetime('now'), datetime('now'))`)
    .run('BUG-003', 'Legacy task', mdPath, body, JSON.stringify(['src/**']));
  store.close();

  const database = new DatabaseSync(join(resolveStoreDir(root), 'playbook.sqlite'));
  const migrationIndex = STORE_MIGRATION_IDS.indexOf(STORE_MIGRATION_ID.VERSIONED_WORK_DEFINITIONS);
  const versionBeforeWorkDefinitions = STORE_INITIAL_SCHEMA_VERSION + migrationIndex;
  database.exec(`DELETE FROM packet_definitions; PRAGMA user_version = ${versionBeforeWorkDefinitions}`);
  database.close();

  const migrated = openStore(root);
  const reference = parseWorkDefinitionReference(`BUG-003@${WORK_DEFINITION_INITIAL_VERSION}`);
  const definition = resolveWorkDefinition(migrated, reference);
  assert.equal(definition.value.body, 'Legacy body.');
  assert.deepEqual(definition.value.requirements, ['preserve this']);
  assert.deepEqual(definition.value.tags, ['migration']);
  migrated.close();
});
