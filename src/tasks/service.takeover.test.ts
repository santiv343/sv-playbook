import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringColumn } from '../db/rows.js';
import { openStore } from '../db/store.js';
import {
  createPacket,
  ensureSession,
  leaseOf,
  movePacket,
  releaseLease,
  startPacket,
  takeoverPacket,
} from './service.js';

const def = (id: string) => ({
  id,
  title: `Packet ${id}`,
  dependsOn: [],
  writeSet: ['src/**'],
  requirements: [],
  evidenceRequired: ['final-sha'],
});

test('takeover adopts an active packet whose lease was released', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-takeover-'));
  const store = openStore(root);
  createPacket(store, root, def('P3-003'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P3-003', 'ready');
  startPacket(store, s1, root, 'P3-003');
  releaseLease(store, s1, 'P3-003');
  assert.equal(leaseOf(store, 'P3-003'), undefined);

  const wt2 = await mkdtemp(join(tmpdir(), 'svp-takeover-wt-'));
  const s2 = ensureSession(store, wt2);
  const adopted = takeoverPacket(store, s2, wt2, 'P3-003', false);
  assert.equal(adopted.lease?.sessionId, s2);
  const event = store.db
    .prepare('SELECT detail FROM events WHERE packet_id = ? AND command = ? ORDER BY seq DESC LIMIT 1')
    .get('P3-003', 'takeover');
  assert.ok(event !== undefined);
  assert.match(stringColumn(event, 'detail'), /from none/);
});
