import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import {
  createPacket,
  ensureSession,
  startPacket,
  movePacket,
  listPackets,
  LifecycleError,
  leaseOf,
  refreshHeartbeat,
  takeoverPacket,
  recoverPacket,
} from './service.js';

const def = (id: string) => ({
  id, title: `Packet ${id}`, dependsOn: [], writeSet: ['src/**'],
  requirements: [], evidenceRequired: ['final-sha'],
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'svp-life-'));
  return { root, store: openStore(root) };
}

test('createPacket writes markdown projection and DB row in draft', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'Body.\n');
  const text = await readFile(join(root, 'docs', 'packets', 'P2-001.md'), 'utf8');
  assert.ok(text.includes('id: P2-001'));
  const rows = listPackets(store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, 'draft');
});

test('duplicate id is refused', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  assert.throws(() => {
    createPacket(store, root, def('P2-001'), 'b');
  }, LifecycleError);
});

test('start requires ready; wrong state names the state', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  const s = ensureSession(store, root);
  assert.throws(() => {
    startPacket(store, s, root, 'P2-001');
  }, /wrong state draft/);
});

test('start matrix: same-session idempotent, other-session refused', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P2-001', 'ready');
  startPacket(store, s1, root, 'P2-001');
  startPacket(store, s1, root, 'P2-001'); // idempotent, no throw
  const wt2 = await mkdtemp(join(tmpdir(), 'svp-wt2-'));
  const s2 = ensureSession(store, wt2);
  assert.throws(() => {
    startPacket(store, s2, wt2, 'P2-001');
  }, /held by session/);
});

test('active exits require the lease holder; done clears the lease', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P2-001', 'ready');
  startPacket(store, s1, root, 'P2-001');
  assert.throws(() => {
    movePacket(store, undefined, 'P2-001', 'review');
  }, /lease/);
  movePacket(store, s1, 'P2-001', 'review');
  movePacket(store, s1, 'P2-001', 'done');
  assert.equal(listPackets(store)[0]?.status, 'done');
});

test('illegal transition is refused with both statuses named', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  assert.throws(() => {
    movePacket(store, undefined, 'P2-001', 'done');
  }, /draft.*done/);
});

test('ensureSession is stable per worktree (reads .svp-session back)', async () => {
  const { root, store } = await setup();
  const a = ensureSession(store, root);
  const b = ensureSession(store, root);
  assert.equal(a, b);
  const onDisk = (await readFile(join(root, '.svp-session'), 'utf8')).trim();
  assert.equal(onDisk, a);
});

test('leaseOf reports holder and freshness; refreshHeartbeat updates it', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P3-001', 'ready');
  startPacket(store, s1, root, 'P3-001');
  const lease = leaseOf(store, 'P3-001');
  assert.ok(lease !== undefined);
  assert.equal(lease.sessionId, s1);
  assert.equal(lease.stale, false);
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE packet_id = ?')
    .run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'P3-001');
  const old = leaseOf(store, 'P3-001');
  assert.equal(old?.stale, true);
  refreshHeartbeat(store, s1);
  assert.equal(leaseOf(store, 'P3-001')?.stale, false);
});

test('takeover: no lease -> error; stale lease -> allowed; live lease needs force', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-002'), 'a');
  const s1 = ensureSession(store, root);
  const wt2 = await mkdtemp(join(tmpdir(), 'svp-wt3-'));
  const s2 = ensureSession(store, wt2);
  assert.throws(() => { takeoverPacket(store, s2, wt2, 'P3-002', false); }, /no lease/);
  movePacket(store, undefined, 'P3-002', 'ready');
  startPacket(store, s1, root, 'P3-002');
  assert.throws(() => { takeoverPacket(store, s2, wt2, 'P3-002', false); }, /lease is live/);
  const forced = takeoverPacket(store, s2, wt2, 'P3-002', true);
  assert.equal(forced.lease?.sessionId, s2);
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE packet_id = ?')
    .run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'P3-002');
  const back = takeoverPacket(store, s1, root, 'P3-002', false); // stale: no force needed
  assert.equal(back.lease?.sessionId, s1);
});

test('recover reports status, lease and recent history without mutating', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-003'), 'a');
  movePacket(store, undefined, 'P3-003', 'ready');
  const report = recoverPacket(store, 'P3-003');
  assert.equal(report.status, 'ready');
  assert.equal(report.lease, undefined);
  assert.ok(report.lastTransitions.length >= 2);
});
