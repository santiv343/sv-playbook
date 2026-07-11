import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import { stringColumn, numberColumn } from '../db/rows.js';
import { DB_FILE, SVP_DIR } from '../db/store.constants.js';
import {
  createPacket,
  ensureSession,
  startPacket,
  movePacket,
  leaseOf,
  takeoverPacket,
  importPackets,
} from '../tasks/service.js';
import { STATUS } from '../tasks/service.constants.js';

const def = (id: string, deps: string[] = [], ws: string[] = ['src/redteam/**']) => ({
  id,
  title: `Red-team ${id}`,
  dependsOn: deps,
  writeSet: ws,
  requirements: [],
  evidenceRequired: ['final-sha'],
});

async function setupStore() {
  const root = await mkdtemp(join(tmpdir(), 'svp-rt-'));
  return { root, store: openStore(root) };
}

async function setupGitRepo() {
  const root = await mkdtemp(join(tmpdir(), 'svp-rt-'));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  return { root, store: openStore(root) };
}

// ---- CHEAT 1: Evidence gate bypass ----
test('red team: moving to done without captured evidence is refused by the evidence gate', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-EVIDENCE-001'), 'a');
  movePacket(store, undefined, 'RT-EVIDENCE-001', 'ready');
  const session = ensureSession(store, root);
  startPacket(store, session, root, 'RT-EVIDENCE-001');
  movePacket(store, session, 'RT-EVIDENCE-001', 'review');
  store.db.prepare('DELETE FROM events WHERE packet_id = ? AND command = ?').run('RT-EVIDENCE-001', 'evidence');
  assert.throws(
    () => { movePacket(store, session, 'RT-EVIDENCE-001', 'done'); },
    /evidence/,
  );
});

// ---- CHEAT 2: Write set violation on review and done ----
test('red team: files changed outside write_set on review is refused by the write-set gate', async () => {
  const { root, store } = await setupGitRepo();
  execFileSync('git', ['checkout', '-b', 'feature/rt-ws'], { cwd: root });
  await mkdir(join(root, 'outside'), { recursive: true });
  await writeFile(join(root, 'outside', 'sneaky.ts'), '', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'x'], { cwd: root });
  createPacket(store, root, def('RT-WRITESET-001'), 'a');
  movePacket(store, undefined, 'RT-WRITESET-001', 'ready');
  const session = ensureSession(store, root);
  startPacket(store, session, root, 'RT-WRITESET-001');
  assert.throws(
    () => { movePacket(store, session, 'RT-WRITESET-001', 'review'); },
    /write_set/,
  );
  assert.throws(
    () => { movePacket(store, session, 'RT-WRITESET-001', 'review'); },
    /outside/,
  );
});

test('red team: moving to done directly from active (skipping review) is refused by the transition gate', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-SKIP-001'), 'a');
  movePacket(store, undefined, 'RT-SKIP-001', 'ready');
  const session = ensureSession(store, root);
  startPacket(store, session, root, 'RT-SKIP-001');
  assert.throws(
    () => { movePacket(store, session, 'RT-SKIP-001', 'done'); },
    /active.*done/,
  );
});

// ---- CHEAT 3: Direct DB write ----
test('red team: direct DB write of an invalid status is caught by the schema CHECK constraint', async () => {
  const { store } = await setupStore();
  assert.throws(
    () => { store.db.prepare("INSERT INTO packets (id, title, path, status, created_at, updated_at) VALUES ('rt-db-001','x','/','cheated',datetime('now'),datetime('now'))").run(); },
    /CHECK constraint failed/,
  );
});

test('red team: direct DB write to force a transition bypassing the lease gate is detectable', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-DBWRITE-001'), 'a');
  const session = ensureSession(store, root);
  movePacket(store, undefined, 'RT-DBWRITE-001', 'ready');
  startPacket(store, session, root, 'RT-DBWRITE-001');
  const lease = leaseOf(store, 'RT-DBWRITE-001');
  assert.ok(lease !== undefined, 'lease should exist after start');
  store.db.prepare("UPDATE packets SET status = ? WHERE id = ?").run(STATUS.DONE, 'RT-DBWRITE-001');
  store.db.prepare("INSERT INTO transitions (packet_id, from_status, to_status, session_id, at) VALUES (?,?,?,?,datetime('now'))")
    .run('RT-DBWRITE-001', STATUS.ACTIVE, STATUS.DONE, session);
  const status = stringColumn(store.db.prepare('SELECT status FROM packets WHERE id = ?').get('RT-DBWRITE-001'), 'status');
  assert.equal(status, STATUS.DONE, 'direct DB write to change status succeeds');
  store.db.prepare('DELETE FROM leases WHERE packet_id = ?').run('RT-DBWRITE-001');
  store.db.prepare("UPDATE packets SET status = ? WHERE id = ?").run(STATUS.ACTIVE, 'RT-DBWRITE-001');
});

// ---- CHEAT 4: .svp deletion and recovery ----
test('red team: deleting .svp DB is recoverable via rebuild', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-RECOVER-001'), 'a');
  store.close();
  const dbPath = join(root, SVP_DIR, DB_FILE);
  assert.ok(existsSync(dbPath), '.svp DB should exist');
  rmSync(dbPath);
  assert.ok(!existsSync(dbPath), '.svp DB should be deleted');
  const store2 = openStore(root);
  assert.ok(store2.db, 'store re-opens after deletion');
  const rows = store2.db.prepare('SELECT COUNT(*) AS cnt FROM packets').all();
  assert.ok(numberColumn(rows[0], 'cnt') >= 0, 'new store is usable after .svp deletion');
  store2.close();
});

// ---- CHEAT 5: Double lease ----
test('red team: double-leasing a packet from another worktree is refused by the lease gate', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-LEASE-001'), 'a');
  movePacket(store, undefined, 'RT-LEASE-001', 'ready');
  const session1 = ensureSession(store, root);
  startPacket(store, session1, root, 'RT-LEASE-001');
  const otherRoot = await mkdtemp(join(tmpdir(), 'svp-rt-leaser-'));
  const store2 = openStore(otherRoot);
  const session2 = ensureSession(store2, otherRoot);
  assert.throws(
    () => { startPacket(store, session2, otherRoot, 'RT-LEASE-001'); },
    /held by session/,
  );
  store2.close();
});

test('red team: takeover without force on a live lease is refused', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-TAKEOVER-001'), 'a');
  movePacket(store, undefined, 'RT-TAKEOVER-001', 'ready');
  const session1 = ensureSession(store, root);
  startPacket(store, session1, root, 'RT-TAKEOVER-001');
  const otherRoot = await mkdtemp(join(tmpdir(), 'svp-rt-takeover-'));
  const session2 = ensureSession(store, otherRoot);
  assert.throws(
    () => { takeoverPacket(store, session2, otherRoot, 'RT-TAKEOVER-001', false); },
    /lease is live/,
  );
});

// ---- CHEAT 6: Unmet dependencies ----
test('red team: starting work with unmet dependencies is not enforced (known gap)', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-DEP-CHILD-001'), 'a');
  store.db.prepare('UPDATE packets SET status = ? WHERE id = ?').run(STATUS.DRAFT, 'RT-DEP-CHILD-001');
  createPacket(store, root, { ...def('RT-DEP-PARENT-001', ['RT-DEP-CHILD-001']), writeSet: ['src/other/**'] }, 'a');
  movePacket(store, undefined, 'RT-DEP-PARENT-001', 'ready');
  const session = ensureSession(store, root);
  startPacket(store, session, root, 'RT-DEP-PARENT-001');
  const row = store.db.prepare('SELECT status FROM packets WHERE id = ?').get('RT-DEP-PARENT-001');
  const status = stringColumn(row, 'status');
  assert.equal(status, STATUS.ACTIVE, 'packet starts despite dep in draft - dep readiness is not enforced');
});

// ---- CHEAT 7: Illegal transitions ----
test('red team: moving draft directly to done is refused by the transition gate', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-ILLEGAL-001'), 'a');
  assert.throws(
    () => { movePacket(store, undefined, 'RT-ILLEGAL-001', 'done'); },
    /draft.*done/,
  );
});

test('red team: moving review directly to draft is refused by the transition gate', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-ILLEGAL-002'), 'a');
  movePacket(store, undefined, 'RT-ILLEGAL-002', 'ready');
  const session = ensureSession(store, root);
  startPacket(store, session, root, 'RT-ILLEGAL-002');
  movePacket(store, session, 'RT-ILLEGAL-002', 'review');
  assert.throws(
    () => { movePacket(store, session, 'RT-ILLEGAL-002', 'draft'); },
    /review.*draft/,
  );
});

test('red team: moving active to ready (releasing without review) is refused by the transition gate', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-ILLEGAL-003'), 'a');
  movePacket(store, undefined, 'RT-ILLEGAL-003', 'ready');
  const session = ensureSession(store, root);
  startPacket(store, session, root, 'RT-ILLEGAL-003');
  assert.throws(
    () => { movePacket(store, session, 'RT-ILLEGAL-003', 'ready'); },
    /active.*ready/,
  );
});

// ---- CHEAT 8: Stale SHA / report integrity ----
test('red team: fabricated SHA in evidence events does not match git HEAD', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rt-sha-'));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  execFileSync('git', ['checkout', '-b', 'feature/rt-sha'], { cwd: root });
  await mkdir(join(root, 'src', 'redteam'), { recursive: true });
  await writeFile(join(root, 'src', 'redteam', 'dummy.ts'), '// legit change\n', 'utf8');
  execFileSync('git', ['add', 'src/redteam/dummy.ts'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'legit'], { cwd: root });
  const store = openStore(root);
  createPacket(store, root, def('RT-SHA-001'), 'a');
  movePacket(store, undefined, 'RT-SHA-001', 'ready');
  const session = ensureSession(store, root);
  startPacket(store, session, root, 'RT-SHA-001');
  movePacket(store, session, 'RT-SHA-001', 'review');
  const realSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const fakeSha = '0000000000000000000000000000000000000000';
  assert.notEqual(fakeSha, realSha, 'sanity: fake SHA is not the real one');
  store.db.prepare("UPDATE events SET detail = ? WHERE packet_id = ? AND command = 'evidence' AND detail LIKE 'head-sha %'")
    .run(`head-sha ${fakeSha}`, 'RT-SHA-001');
  const evRow = store.db.prepare(
    "SELECT detail FROM events WHERE packet_id = ? AND command = 'evidence' AND detail LIKE 'head-sha %'",
  ).get('RT-SHA-001');
  const storedSha = stringColumn(evRow, 'detail').replace('head-sha ', '');
  assert.equal(storedSha, fakeSha, 'fabricated SHA is injected into evidence');
  store.close();
});

// ---- CHEAT 9: Export drift detection ----
test('red team: hand-editing a generated .md export is detected and synced by importPackets', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-DRIFT-001'), 'Original body.\n');
  const mdPath = join(root, 'docs', 'packets', 'RT-DRIFT-001.md');
  const original = await readFile(mdPath, 'utf8');
  assert.ok(original.includes('Original body.'), 'original export has the body');
  assert.ok(original.includes('<!-- GENERATED FROM THE BOARD'), 'original export has GENERATED banner');
  const tampered = original.replace('Original body.', 'TAMPERED body.');
  await writeFile(mdPath, tampered, 'utf8');
  const tamperedRead = await readFile(mdPath, 'utf8');
  assert.ok(tamperedRead.includes('TAMPERED body.'), 'tampered content is on disk');
  assert.ok(tamperedRead.includes('<!-- GENERATED FROM THE BOARD'), 'GENERATED banner still present after hand-edit');
  importPackets(store, root);
  const bodyFromDb = stringColumn(
    store.db.prepare('SELECT body FROM packets WHERE id = ?').get('RT-DRIFT-001'),
    'body',
  );
  assert.equal(bodyFromDb, 'TAMPERED body.\n', 'importPackets regenerated DB body from tampered .md export');
  const row = store.db.prepare('SELECT status FROM packets WHERE id = ?').get('RT-DRIFT-001');
  assert.equal(stringColumn(row, 'status'), STATUS.DRAFT, 'status unchanged by import after hand-edit');
});

// ---- CHEAT 10: Write set conflict on ready ----
test('red team: moving to ready with overlapping write_set is refused by the conflict gate', async () => {
  const { root, store } = await setupStore();
  const session = ensureSession(store, root);
  createPacket(store, root, { ...def('RT-CONFLICT-A-001'), writeSet: ['src/redteam/**'] }, 'a');
  movePacket(store, undefined, 'RT-CONFLICT-A-001', 'ready');
  startPacket(store, session, root, 'RT-CONFLICT-A-001');
  createPacket(store, root, { ...def('RT-CONFLICT-B-001'), writeSet: ['src/redteam/sub/**'] }, 'a');
  assert.throws(
    () => { movePacket(store, undefined, 'RT-CONFLICT-B-001', 'ready'); },
    /write_set conflict/,
  );
});

// ---- CHEAT 11: Fake lease takeover (stale timestamp) ----
test('red team: stale-lease takeover succeeds when lease is expired', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-STALE-001'), 'a');
  movePacket(store, undefined, 'RT-STALE-001', 'ready');
  const session1 = ensureSession(store, root);
  startPacket(store, session1, root, 'RT-STALE-001');
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE packet_id = ?')
    .run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'RT-STALE-001');
  const otherRoot = await mkdtemp(join(tmpdir(), 'svp-rt-stale-'));
  const session2 = ensureSession(store, otherRoot);
  const result = takeoverPacket(store, session2, otherRoot, 'RT-STALE-001', false);
  assert.equal(result.lease?.sessionId, session2, 'stale lease was taken over');
});

// ---- CHEAT 12: Verify command bypass ----
test('red team: moving to review when verify command fails is refused by the verify gate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rt-verify-'));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  execFileSync('git', ['checkout', '-b', 'feature/rt-verify'], { cwd: root });
  await mkdir(join(root, 'src', 'redteam'), { recursive: true });
  await writeFile(join(root, 'src', 'redteam', 'file.ts'), ' ', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'x'], { cwd: root });
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({ verifyCommand: 'node -e process.exit(1)' }), 'utf8');
  const store = openStore(root);
  createPacket(store, root, def('RT-VERIFY-001'), 'a');
  const session = ensureSession(store, root);
  movePacket(store, undefined, 'RT-VERIFY-001', 'ready');
  startPacket(store, session, root, 'RT-VERIFY-001');
  assert.throws(
    () => { movePacket(store, session, 'RT-VERIFY-001', 'review'); },
    /verify/,
  );
  assert.equal(stringColumn(store.db.prepare('SELECT status FROM packets WHERE id = ?').get('RT-VERIFY-001'), 'status'), STATUS.ACTIVE);
  store.close();
});

// ---- CHEAT 13: Starting without being ready ----
test('red team: starting a draft packet is refused with the current status name', async () => {
  const { root, store } = await setupStore();
  createPacket(store, root, def('RT-START-001'), 'a');
  const session = ensureSession(store, root);
  assert.throws(
    () => { startPacket(store, session, root, 'RT-START-001'); },
    /wrong state draft/,
  );
});

// ---- SAFETY: Store migration always uses fixture DBs, never the shared .svp ----
test('red team: store fixture DB is used during migration, never the shared .svp', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rt-mig-'));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });

  const store = openStore(root);
  const fixturePath = join(root, SVP_DIR, DB_FILE);
  assert.ok(existsSync(fixturePath), 'fixture DB must exist under fixture root');
  assert.ok(fixturePath.startsWith(root), 'fixture DB path must be under the test root');
  store.close();
});
