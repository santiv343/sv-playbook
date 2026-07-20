import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import {
  createPacket,
  ensureSession,
  leaseOf,
  listPackets,
  movePacket,
  startPacket,
} from './service.js';
import { STATUS } from './service.constants.js';
import { LifecycleError } from './service.errors.js';
import { writeServiceTestConfig } from './service.test.support.js';

const DEPENDENCY_ID = {
  START: 'DEP-001',
  READY: 'DEP-002',
  DROPPED: 'DEP-003',
} as const;

const TASK_ID = {
  START: 'TASK-001',
  READY: 'TASK-002',
  DROPPED: 'TASK-003',
} as const;

function definition(id: string, dependsOn: readonly string[] = []) {
  return {
    id,
    title: `Packet ${id}`,
    dependsOn: [...dependsOn],
    writeSet: [`work/${id}/**`],
    requirements: [],
    evidenceRequired: ['final-sha'],
  };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'svp-dependencies-'));
  await writeServiceTestConfig(root);
  return { root, store: openStore(root) };
}

test('task start is refused when a depends_on packet is not done', async () => {
  const { root, store } = await setup();
  createPacket(store, root, definition(DEPENDENCY_ID.START), 'dependency');
  createPacket(store, root, definition(TASK_ID.START, [DEPENDENCY_ID.START]), 'dependent');
  store.db.prepare('UPDATE packets SET status = ? WHERE id = ?').run(STATUS.READY, TASK_ID.START);
  const session = ensureSession(store, root);
  assert.throws(
    () => { startPacket(store, session, root, TASK_ID.START); },
    /unmet dependencies: DEP-001 \(draft\)/,
  );
  assert.equal(leaseOf(store, TASK_ID.START), undefined);
});

test('task move to ready is refused until every dependency is terminal', async () => {
  const { root, store } = await setup();
  createPacket(store, root, definition(DEPENDENCY_ID.READY), 'dependency');
  createPacket(store, root, definition(TASK_ID.READY, [DEPENDENCY_ID.READY]), 'dependent');
  assert.throws(
    () => { movePacket(store, undefined, TASK_ID.READY, STATUS.READY); },
    /unmet dependencies: DEP-002 \(draft\)/,
  );
  assert.equal(listPackets(store).find((packet) => packet.id === TASK_ID.READY)?.status, STATUS.DRAFT);
});

test('a dropped dependency unblocks ready and start', async () => {
  const { root, store } = await setup();
  createPacket(store, root, definition(DEPENDENCY_ID.DROPPED), 'dependency');
  createPacket(store, root, definition(TASK_ID.DROPPED, [DEPENDENCY_ID.DROPPED]), 'dependent');
  movePacket(store, undefined, DEPENDENCY_ID.DROPPED, STATUS.DROPPED);
  movePacket(store, undefined, TASK_ID.DROPPED, STATUS.READY);
  const session = ensureSession(store, root);
  startPacket(store, session, root, TASK_ID.DROPPED);
  assert.equal(listPackets(store).find((packet) => packet.id === TASK_ID.DROPPED)?.status, STATUS.ACTIVE);
});

test('createPacket rejects a dependency reference that does not exist', async () => {
  const { root, store } = await setup();
  assert.throws(
    () => { createPacket(store, root, definition('TASK-MISSING', ['MISSING-001']), 'dependent'); },
    (error: unknown) => error instanceof LifecycleError && error.message.includes('MISSING-001'),
  );
  assert.equal(listPackets(store).find((packet) => packet.id === 'TASK-MISSING'), undefined);
});
