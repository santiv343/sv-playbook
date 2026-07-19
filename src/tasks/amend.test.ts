import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amendPacket,
  createPacket,
  ensureSession,
  movePacket,
  startPacket,
} from './service.js';
import { EVENT_AMEND_ACTIVE, STATUS } from './service.constants.js';
import { stringColumn } from '../db/rows.js';
import { setupServiceTest as setup } from './service.test.support.js';

const def = (id: string) => ({ id, title: `Packet ${id}`, dependsOn: [], writeSet: ['src/**'], requirements: [], evidenceRequired: ['final-sha'] });

test('amend in active state extends the write_set and records an audit event', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('AMD-ACTIVE-001'), 'a');
  movePacket(store, undefined, 'AMD-ACTIVE-001', STATUS.READY);
  const s1 = ensureSession(store, root);
  startPacket(store, s1, root, 'AMD-ACTIVE-001');
  amendPacket(store, root, 'AMD-ACTIVE-001', { writeSet: ['src/**', 'docs/**'] });
  const ws = stringColumn(store.db.prepare('SELECT write_set FROM packets WHERE id = ?').get('AMD-ACTIVE-001'), 'write_set');
  assert.ok(ws.includes('src/**'));
  assert.ok(ws.includes('docs/**'));
  const events = store.db.prepare('SELECT command, detail FROM events WHERE packet_id = ? AND command = ?').all('AMD-ACTIVE-001', EVENT_AMEND_ACTIVE);
  assert.equal(events.length, 1);
  assert.ok(stringColumn(events[0], 'detail').includes('docs/**'));
});

test('amend in active state rejects non-superset write_set', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('AMD-ACTIVE-002'), 'a');
  movePacket(store, undefined, 'AMD-ACTIVE-002', STATUS.READY);
  const s1 = ensureSession(store, root);
  startPacket(store, s1, root, 'AMD-ACTIVE-002');
  assert.throws(
    () => { amendPacket(store, root, 'AMD-ACTIVE-002', { writeSet: ['docs/**'] }); },
    /write_set can only be extended/,
  );
});

test('amend in active state rejects updates to fields other than write_set', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('AMD-ACTIVE-003'), 'a');
  movePacket(store, undefined, 'AMD-ACTIVE-003', STATUS.READY);
  const s1 = ensureSession(store, root);
  startPacket(store, s1, root, 'AMD-ACTIVE-003');
  assert.throws(
    () => { amendPacket(store, root, 'AMD-ACTIVE-003', { title: 'new', writeSet: ['src/**', 'docs/**'] }); },
    /only write_set can be amended in active/,
  );
  assert.throws(
    () => { amendPacket(store, root, 'AMD-ACTIVE-003', { body: 'new body' }); },
    /only write_set can be amended in active/,
  );
});

for (const { status, pid } of [{ status: STATUS.DONE, pid: 'AMD-DONE-001' }, { status: STATUS.DROPPED, pid: 'AMD-DROPPED-001' }, { status: STATUS.BLOCKED, pid: 'AMD-BLOCKED-001' }]) {
  test(`amend rejects packets in ${status}`, async () => {
    const { root, store } = await setup();
    createPacket(store, root, def(pid), 'a');
    if (status === STATUS.DROPPED) {
      movePacket(store, undefined, pid, STATUS.DROPPED);
    } else if (status === STATUS.BLOCKED) {
      movePacket(store, undefined, pid, STATUS.READY);
      const s = ensureSession(store, root);
      startPacket(store, s, root, pid);
      movePacket(store, s, pid, STATUS.BLOCKED);
    } else {
      movePacket(store, undefined, pid, STATUS.READY);
      store.db.prepare('UPDATE packets SET status = ? WHERE id = ?').run(STATUS.DONE, pid);
    }
    assert.throws(
      () => { amendPacket(store, root, pid, { body: 'x' }); },
      /cannot amend packet/,
    );
  });
}
