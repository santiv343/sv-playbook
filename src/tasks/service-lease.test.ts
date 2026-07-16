import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPacket,
  ensureSession,
  startPacket,
  movePacket,
} from './service.js';
import { SESSION_FILE_NAME } from './service.constants.js';
import { setupServiceTest as setup } from './service.test.support.js';
const def = (id: string) => ({ id, title: `Packet ${id}`, dependsOn: [], writeSet: ['src/**'], requirements: [], evidenceRequired: ['final-sha'] });

test('start matrix: same-session idempotent, other-session refused', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P2-001', 'ready');
  startPacket(store, s1, root, 'P2-001');
  startPacket(store, s1, root, 'P2-001'); // idempotent, no throw
  const wt2 = await mkdtemp(join(tmpdir(), 'svp-wt2-'));
  const s2 = ensureSession(store, wt2);
  assert.throws(() => { startPacket(store, s2, wt2, 'P2-001'); }, /held by session/);
});
test('ensureSession is stable per worktree (reads .svp/session back)', async () => {
  const { root, store } = await setup();
  const a = ensureSession(store, root);
  const b = ensureSession(store, root);
  assert.equal(a, b);
  const onDisk = (await readFile(join(root, SESSION_FILE_NAME), 'utf8')).trim();
  assert.equal(onDisk, a);
});
