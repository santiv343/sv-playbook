import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPacket, movePacket, startPacket, ensureSession, amendPacket } from './service.js';
import { CheckpointPendingDecisionError } from './service.errors.js';
import { setupServiceTest } from './service.test.support.js';

const def = (id: string, writeSet: string[]) => ({
  id,
  title: `Packet ${id}`,
  dependsOn: [],
  writeSet,
  requirements: [],
  evidenceRequired: ['final-sha'],
});

const checkpointOn = JSON.stringify({ tasks: { complexityCheckpoint: { enabled: true, requireDecisionForTypes: [], requireDecisionForPaths: [] } } });
async function setup() { const result = await setupServiceTest(); await writeFile(join(result.root, 'playbook.config.json'), checkpointOn, 'utf8'); return result; }

test('task move ready refuses a packet with a pending checkpoint decision', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('PKT-1', ['src/db/**']), 'prior');
  createPacket(store, root, def('PKT-2', ['src/serve/assets/**']), 'candidate');
  assert.throws(() => { movePacket(store, undefined, 'PKT-2', 'ready'); }, CheckpointPendingDecisionError);
});

test('task move review re-checks the checkpoint if the packet grew mid-flight', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('PKT-1', ['src/db/**']), 'prior');
  createPacket(store, root, def('PKT-2', ['src/db/**']), 'candidate');
  movePacket(store, undefined, 'PKT-2', 'ready');
  const s1 = ensureSession(store, root);
  startPacket(store, s1, root, 'PKT-2');
  amendPacket(store, root, 'PKT-2', { writeSet: ['src/db/**', 'src/serve/assets/**'] });
  assert.throws(() => { movePacket(store, s1, 'PKT-2', 'review'); }, CheckpointPendingDecisionError);
});
