import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPacket,
  ensureSession,
  startPacket,
  movePacket,
  leaseOf,
  refreshHeartbeat,
} from './service.js';
import { setupServiceTest as setup } from './service.test.support.js';
const def = (id: string) => ({ id, title: `Packet ${id}`, dependsOn: [], writeSet: ['src/**'], requirements: [], evidenceRequired: ['final-sha'] });

test('leaseOf reports holder and freshness; refreshHeartbeat updates it', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P3-001', 'ready');
  startPacket(store, s1, root, 'P3-001');
  const lease = leaseOf(store, 'P3-001'); assert.ok(lease);
  assert.equal(lease.sessionId, s1);
  assert.equal(lease.stale, false);
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE packet_id = ?').run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'P3-001');
  const old = leaseOf(store, 'P3-001');
  assert.equal(old?.stale, true);
  refreshHeartbeat(store, s1);
  assert.equal(leaseOf(store, 'P3-001')?.stale, false);
});
