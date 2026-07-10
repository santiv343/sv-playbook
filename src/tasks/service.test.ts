import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
  releaseLease,
  overlaps,
  refreshHeartbeat,
  takeoverPacket,
  recoverPacket,
  notePacket,
  briefPacket,
  importPackets,
  amendPacket,
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
  assert.throws(() => { createPacket(store, root, def('P2-001'), 'b'); }, LifecycleError);
});

test('start requires ready; wrong state names the state', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  const s = ensureSession(store, root);
  assert.throws(() => { startPacket(store, s, root, 'P2-001'); }, /wrong state draft/);
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
  assert.throws(() => { startPacket(store, s2, wt2, 'P2-001'); }, /held by session/);
});

test('active exits require the lease holder; done clears the lease', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P2-001', 'ready');
  startPacket(store, s1, root, 'P2-001');
  assert.throws(() => { movePacket(store, undefined, 'P2-001', 'review'); }, /lease/);
  movePacket(store, s1, 'P2-001', 'review');
  movePacket(store, s1, 'P2-001', 'done');
  assert.equal(listPackets(store)[0]?.status, 'done');
});

test('illegal transition is refused with both statuses named', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  assert.throws(() => { movePacket(store, undefined, 'P2-001', 'done'); }, /draft.*done/);
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
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE packet_id = ?').run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'P3-001');
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
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE packet_id = ?').run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'P3-002');
  const back = takeoverPacket(store, s1, root, 'P3-002', false);
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
  const brief = briefPacket(store, 'P3-005');
  ['# Brief: P3-005', '## Status', '## Definition', '## Process', 'Implement the thing.'].forEach((m) => { assert.ok(brief.includes(m), `missing ${m}`); });
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

test('demotion and rejection release the lease; release frees an own lease', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('FLOW-LEASE-001'), 'a');
  const session = ensureSession(store, root);
  movePacket(store, undefined, 'FLOW-LEASE-001', 'ready');
  startPacket(store, session, root, 'FLOW-LEASE-001');

  movePacket(store, session, 'FLOW-LEASE-001', 'blocked');
  assert.ok(leaseOf(store, 'FLOW-LEASE-001') !== undefined);
  movePacket(store, session, 'FLOW-LEASE-001', 'ready');
  assert.equal(leaseOf(store, 'FLOW-LEASE-001'), undefined);

  startPacket(store, session, root, 'FLOW-LEASE-001');
  releaseLease(store, session, 'FLOW-LEASE-001');
  assert.equal(leaseOf(store, 'FLOW-LEASE-001'), undefined);
  assert.throws(() => { releaseLease(store, session, 'FLOW-LEASE-001'); }, /no lease/);
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

test('task brief reads the body from the DB, not the markdown file', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-DB'), 'Hello from DB.\n');
  const path = join(root, 'docs', 'packets', 'P3-DB.md');
  await writeFile(path, 'garbage content', 'utf8');
  const brief = briefPacket(store, 'P3-DB');
  assert.ok(brief.includes('Hello from DB.'), 'brief should contain body from DB, not md file');
});

test('raw SQL cannot insert an invalid packet status', async () => {
  const { store } = await setup();
  assert.throws(() => { store.db.prepare("INSERT INTO packets (id, title, path, status, created_at, updated_at) VALUES ('x','x','/','bad',datetime('now'),datetime('now'))").run(); });
});

test('importPackets imports a new packet from a valid .md file', async () => {
  const { root, store } = await setup();
  store.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('DEP-001', 'Dependency 1', '/tmp/dep', 'draft', '[]', datetime('now'), datetime('now'))").run();
  await mkdir(join(root, 'docs', 'packets'), { recursive: true });
  const content = '---\nid: IMP-001\ntitle: Imported Packet\ndepends_on: ["DEP-001"]\nwrite_set: ["src/import/**"]\nrequirements: []\nevidence_required: ["final-sha"]\n---\n\nImported body text.';
  await writeFile(join(root, 'docs', 'packets', 'IMP-001.md'), content, 'utf8');
  await writeFile(join(root, 'docs', 'packets', 'README.txt'), 'not a packet', 'utf8');
  const result = importPackets(store, root);
  assert.equal(result.imported, 1);
  assert.equal(result.updated, 0);
  const row = store.db.prepare('SELECT body, title, status FROM packets WHERE id = ?').get('IMP-001');
  assert.ok(row !== undefined);
  assert.equal(stringColumn(row, 'body'), 'Imported body text.');
  assert.equal(stringColumn(row, 'title'), 'Imported Packet');
  assert.equal(stringColumn(row, 'status'), 'draft');
  const deps = store.db.prepare('SELECT depends_on_id FROM packet_deps WHERE packet_id = ? ORDER BY depends_on_id').all('IMP-001');
  assert.equal(deps.length, 1);
  assert.equal(stringColumn(deps[0], 'depends_on_id'), 'DEP-001');
  assert.equal(store.db.prepare('SELECT 1 FROM packets WHERE id = ?').get('README'), undefined);
});

test('importPackets is idempotent and updates deps on re-run', async () => {
  const { root, store } = await setup();
  store.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('DEP-A', 'Dep A', '/tmp/dep', 'draft', '[]', datetime('now'), datetime('now'))").run();
  store.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('DEP-C', 'Dep C', '/tmp/dep', 'draft', '[]', datetime('now'), datetime('now'))").run();
  await mkdir(join(root, 'docs', 'packets'), { recursive: true });
  const mkContent = (title: string, deps: string[], body: string, writeSet: string[]) =>
    `---\nid: IMP-002\ntitle: ${title}\ndepends_on: ${JSON.stringify(deps)}\nwrite_set: ${JSON.stringify(writeSet)}\nrequirements: []\nevidence_required: ["final-sha"]\n---\n\n${body}`;
  await writeFile(join(root, 'docs', 'packets', 'IMP-002.md'), mkContent('First', ['DEP-A'], 'First body.', ['src/a/**']), 'utf8');
  const r1 = importPackets(store, root);
  assert.equal(r1.imported, 1);
  assert.equal(r1.updated, 0);
  const r2 = importPackets(store, root);
  assert.equal(r2.imported, 0);
  assert.equal(r2.updated, 1);
  let deps = store.db.prepare('SELECT depends_on_id FROM packet_deps WHERE packet_id = ? ORDER BY depends_on_id').all('IMP-002');
  assert.equal(deps.length, 1);
  assert.equal(stringColumn(deps[0], 'depends_on_id'), 'DEP-A');
  await writeFile(join(root, 'docs', 'packets', 'IMP-002.md'), mkContent('Updated', ['DEP-C'], 'Updated body.', ['src/b/**']), 'utf8');
  const r3 = importPackets(store, root);
  assert.equal(r3.imported, 0);
  assert.equal(r3.updated, 1);
  const row = store.db.prepare('SELECT body, title, write_set FROM packets WHERE id = ?').get('IMP-002');
  assert.equal(stringColumn(row, 'body'), 'Updated body.');
  assert.equal(stringColumn(row, 'title'), 'Updated');
  deps = store.db.prepare('SELECT depends_on_id FROM packet_deps WHERE packet_id = ? ORDER BY depends_on_id').all('IMP-002');
  assert.equal(deps.length, 1);
  assert.equal(stringColumn(deps[0], 'depends_on_id'), 'DEP-C');
});

test('importPackets does not modify status on update', async () => {
  const { root, store } = await setup();
  await mkdir(join(root, 'docs', 'packets'), { recursive: true });
  await writeFile(join(root, 'docs', 'packets', 'IMP-003.md'), '---\nid: IMP-003\ntitle: Status Safe Packet\ndepends_on: []\nwrite_set: ["src/safe/**"]\nrequirements: []\nevidence_required: ["final-sha"]\n---\n\nBody.', 'utf8');
  importPackets(store, root);
  store.db.prepare("UPDATE packets SET status = 'ready', priority = 50 WHERE id = ?").run('IMP-003');
  importPackets(store, root);
  assert.equal(stringColumn(store.db.prepare('SELECT status FROM packets WHERE id = ?').get('IMP-003'), 'status'), 'ready');
});

test('moving a packet never modifies its generated markdown export', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('MD-001'), 'Body.\n');
  const path = join(root, 'docs', 'packets', 'MD-001.md');
  const initialBytes = await readFile(path);
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'MD-001', 'ready');
  startPacket(store, s1, root, 'MD-001');
  movePacket(store, s1, 'MD-001', 'review');
  movePacket(store, s1, 'MD-001', 'done');
  const finalBytes = await readFile(path);
  assert.deepEqual(finalBytes, initialBytes, 'md file bytes should not change after moves');
  const text = finalBytes.toString('utf8');
  assert.ok(text.includes('<!-- GENERATED FROM THE BOARD'), 'missing GENERATED banner');
  assert.ok(!text.includes('\nclosed:'), 'md must not contain closed: stamp');
  assert.ok(!text.includes('\nstate:'), 'md must not contain status line');
});

test('importPackets returns zeros for a missing packets directory', async () => {
  const { store, root } = await setup();
  const result = importPackets(store, root);
  assert.equal(result.imported, 0);
  assert.equal(result.updated, 0);
});
test("task brief prepends the universal acceptance rubric to every worker prompt", async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('RUB-001'), 'Body.\n');
  const brief = briefPacket(store, 'RUB-001');
  assert.ok(brief.includes('## Universal Acceptance Rubric'), 'brief should contain the rubric marker');
});

test('move to review is refused when the branch changed a file outside the write_set', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-ws-'));
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  execFileSync('git', ['checkout', '-b', 'feature/test'], { cwd: root });
  await mkdir(join(root, 'src', 'b'), { recursive: true });
  await writeFile(join(root, 'src', 'b', 'out.ts'), '', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'x'], { cwd: root });
  const store = openStore(root);
  createPacket(store, root, { ...def('WS-001'), writeSet: ['src/a/**'] }, 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'WS-001', 'ready');
  startPacket(store, s1, root, 'WS-001');
  assert.throws(() => { movePacket(store, s1, 'WS-001', 'review'); }, /src.b.out/);
});

test('amend updates the body and write_set in the DB and regenerates the export', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('AMD-001'), 'a');
  amendPacket(store, root, 'AMD-001', { body: 'b', writeSet: ['src/a/**'] });
  assert.equal(stringColumn(store.db.prepare('SELECT body FROM packets WHERE id = ?').get('AMD-001'), 'body'), 'b');
  assert.ok(stringColumn(store.db.prepare('SELECT write_set FROM packets WHERE id = ?').get('AMD-001'), 'write_set').includes('src/a/**'));
  assert.ok((await readFile(join(root, 'docs', 'packets', 'AMD-001.md'), 'utf8')).includes('src/a/**'));
});

test('move to review is refused when the project verify command fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-verify-'));
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  execFileSync('git', ['checkout', '-b', 'feature/verify-test'], { cwd: root });
  await mkdir(join(root, 'src', 'a'), { recursive: true });
  await writeFile(join(root, 'src', 'a', 'ok.ts'), ' ', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'x'], { cwd: root });
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: 'node -e process.exit(1)',
  }), 'utf8');
  const store = openStore(root);
  createPacket(store, root, { ...def('VERIFY-001'), writeSet: ['src/a/**'] }, 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'VERIFY-001', 'ready');
  startPacket(store, s1, root, 'VERIFY-001');
  assert.throws(() => { movePacket(store, s1, 'VERIFY-001', 'review'); }, /verify/);
  assert.equal(listPackets(store)[0]?.status, 'active');
});
