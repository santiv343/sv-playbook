import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import { stringColumn } from '../db/rows.js';
import {
  createPacket,
  ensureSession,
  startPacket,
  movePacket,
  listPackets,
  leaseOf,
  overlaps,
  rebuildFromFiles,
  refreshHeartbeat,
  takeoverPacket,
  recoverPacket,
  notePacket,
  briefPacket,
} from './service.js';
import { LifecycleError } from './service.errors.js';

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

test('note records a breadcrumb event visible in recover', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-004'), 'a');
  const s1 = ensureSession(store, root);
  notePacket(store, s1, 'P3-004', 'halfway through the RED test');
  const report = recoverPacket(store, 'P3-004');
  assert.ok(report.lastNotes.some((n) => n.includes('halfway through')));
  assert.throws(() => { notePacket(store, s1, 'P3-004', '   '); }, LifecycleError);
});

test('brief has the fixed structure and embeds the packet document', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-005'), 'Implement the thing.\n');
  const brief = briefPacket(store, root, 'P3-005');
  for (const marker of ['# Brief: P3-005', '## Status', '## Definition', '## Process', 'Implement the thing.']) {
    assert.ok(brief.includes(marker), `missing ${marker}`);
  }
});

test('ready demotes to draft and review rejection releases the packet', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('F1-001'), 'a');
  movePacket(store, undefined, 'F1-001', 'ready');
  movePacket(store, undefined, 'F1-001', 'draft');
  assert.equal(listPackets(store)[0]?.status, 'draft');
  movePacket(store, undefined, 'F1-001', 'ready');
  const s1 = ensureSession(store, root);
  startPacket(store, s1, root, 'F1-001');
  movePacket(store, s1, 'F1-001', 'review');
  movePacket(store, undefined, 'F1-001', 'ready');
  assert.equal(leaseOf(store, 'F1-001'), undefined);
  const wt2 = await mkdtemp(join(tmpdir(), 'svp-wt2-'));
  const s2 = ensureSession(store, wt2);
  startPacket(store, s2, wt2, 'F1-001');
});

test('overlaps detects overlapping globs', () => {
  assert.equal(overlaps('src/**', 'src/cli/**'), true);
  assert.equal(overlaps('src/a/**', 'src/b/**'), false);
  assert.equal(overlaps('eslint.config.js', 'eslint.config.js'), true);
  assert.equal(overlaps('src/**', 'docs/**'), false);
});

test('moving to ready is refused when the write_set conflicts with an in-flight packet', async () => {
  const { root, store } = await setup();
  createPacket(store, root, { ...def('A-001'), writeSet: ['src/x/**'] }, 'a');
  movePacket(store, undefined, 'A-001', 'ready');
  createPacket(store, root, { ...def('A-002'), writeSet: ['src/x/inner/**'] }, 'a');
  assert.throws(() => movePacket(store, undefined, 'A-002', 'ready'), /write_set conflict/);
});

test('moving to review captures head evidence as events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-ev-'));
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  const store = openStore(root);
  createPacket(store, root, def('E-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'E-001', 'ready');
  startPacket(store, s1, root, 'E-001');
  movePacket(store, s1, 'E-001', 'review');
  const events = store.db.prepare("SELECT detail FROM events WHERE command = 'evidence'").all();
  assert.equal(events.length, 2);
  const detail = stringColumn(events[0], 'detail');
  assert.ok(detail.startsWith('head-sha '));
  assert.match(detail, /^head-sha [0-9a-f]{40}$/);
});

test('done stamps the packet file and rebuild restores terminal statuses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rb-'));
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  const store = openStore(root);
  createPacket(store, root, def('R-001'), 'body');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'R-001', 'ready');
  startPacket(store, s1, root, 'R-001');
  movePacket(store, s1, 'R-001', 'review');
  movePacket(store, s1, 'R-001', 'done');
  const text = await readFile(join(root, 'docs', 'packets', 'R-001.md'), 'utf8');
  assert.ok(text.includes('\nclosed: done '), 'packet file missing closed stamp');
  store.close();
  const counts = rebuildFromFiles(root);
  assert.equal(counts.done, 1);
  const store2 = openStore(root);
  assert.equal(listPackets(store2)[0]?.status, 'done');
  store2.close();
});

test('raw SQL cannot insert an invalid packet status', async () => {
  const { store } = await setup();
  assert.throws(() => {
    store.db.prepare('INSERT INTO packets (id, title, path, status, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run('P3-006', 'Packet P3-006', 'docs/packets/P3-006.md', 'invalid', new Date().toISOString(), new Date().toISOString());
  });
});
