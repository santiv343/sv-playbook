import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { amendPacket, createPacket } from './service.js';
import { CheckpointPendingDecisionError } from './service.errors.js';
import { decisions } from './schema.constants.js';
import { assertCheckpointClear } from './checkpoint-gate.js';
import { setupServiceTest } from './service.test.support.js';

const now = (): string => new Date().toISOString();

const def = (id: string, writeSet: string[]) => ({
  id,
  title: `Packet ${id}`,
  dependsOn: [],
  writeSet,
  requirements: [],
  evidenceRequired: ['final-sha'],
});

test('blocks when write_set is novel and no decision is linked', async () => {
  const { root, store } = await setupServiceTest();
  createPacket(store, root, def('PKT-1', ['src/db/**']), 'prior');
  createPacket(store, root, def('PKT-2', ['src/serve/assets/**']), 'candidate');
  assert.throws(() => { assertCheckpointClear(store, 'PKT-2'); }, CheckpointPendingDecisionError);
});

test('passes when the novel write_set has an answered, current decision', async () => {
  const { root, store } = await setupServiceTest();
  createPacket(store, root, def('PKT-1', ['src/db/**']), 'prior');
  createPacket(store, root, def('PKT-2', ['src/serve/assets/**']), 'candidate');
  store.orm.insert(decisions).values({
    id: 'DEC-001',
    question: 'approve new assets write set?',
    answer: 'approved',
    packetId: 'PKT-2',
    answeredAgainstVersion: 1,
    createdAt: now(),
    updatedAt: now(),
  }).run();
  assert.doesNotThrow(() => { assertCheckpointClear(store, 'PKT-2'); });
});

test('blocks again when the packet was amended after the decision was answered', async () => {
  const { root, store } = await setupServiceTest();
  createPacket(store, root, def('PKT-1', ['src/db/**']), 'prior');
  createPacket(store, root, def('PKT-2', ['src/serve/assets/**']), 'candidate');
  store.orm.insert(decisions).values({
    id: 'DEC-001',
    question: 'approve new assets write set?',
    answer: 'approved',
    packetId: 'PKT-2',
    answeredAgainstVersion: 1,
    createdAt: now(),
    updatedAt: now(),
  }).run();
  amendPacket(store, root, 'PKT-2', { body: 'amended' });
  assert.throws(() => { assertCheckpointClear(store, 'PKT-2'); }, CheckpointPendingDecisionError);
});

test('does not block when the checkpoint is disabled in config', async () => {
  const { root, store } = await setupServiceTest();
  createPacket(store, root, def('PKT-1', ['src/db/**']), 'prior');
  createPacket(store, root, def('PKT-2', ['src/serve/assets/**']), 'candidate');
  await writeFile(
    `${root}/playbook.config.json`,
    JSON.stringify({ tasks: { complexityCheckpoint: { enabled: false, requireDecisionForTypes: [], requireDecisionForPaths: [] } } }),
    'utf8',
  );
  assert.doesNotThrow(() => { assertCheckpointClear(store, 'PKT-2'); });
});
