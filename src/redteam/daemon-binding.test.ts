import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { openStore } from '../db/store.js';
import { createDaemon, startDaemon } from '../daemon/daemon.js';
import type { DaemonInstance } from '../daemon/daemon.types.js';
import { DAEMON_ROUTE } from '../daemon/daemon.constants.js';
import { packets, taskEvents } from '../tasks/schema.constants.js';
import { OS_PLATFORM } from '../platform.constants.js';
import type { CommandPort, SignalPort } from '../runtime/context.types.js';
import { freePort, initFixtureRepo, nextIndex, postJson, spawnCollect } from './daemon-test-utils.test.support.js';

const bindingRows = sqliteTable('workspace_bindings', {
  workspace: text('workspace').primaryKey(),
  sessionId: text('session_id').notNull(),
});

const sessionRows = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  worktree: text('worktree').notNull(),
});

const transitionRows = sqliteTable('transitions', {
  packetId: text('packet_id').notNull(),
  sessionId: text('session_id'),
});

function norm(path: string): string {
  const canonical = process.platform === OS_PLATFORM.WINDOWS ? realpathSync.native(path) : realpathSync(path);
  return canonical.toLowerCase();
}

function fakeSignalPort(): SignalPort {
  return { subscribe: () => () => {} };
}

async function stopQuietly(daemon: DaemonInstance): Promise<void> {
  await daemon.stop().then(() => undefined, () => undefined);
}

interface SpyPort extends CommandPort {
  executed(): number;
}

function spyPort(): SpyPort {
  let count = 0;
  return {
    execute: () => { count += 1; return Promise.resolve(0); },
    executed: () => count,
  };
}

function seedPacket(id: string, root: string): void {
  const now = new Date().toISOString();
  const seed = openStore(root);
  seed.orm.insert(packets).values({ id, title: id, path: '/tmp', status: 'ready', body: '', writeSetJson: '[]', type: '', priority: 100, createdAt: now, updatedAt: now }).run();
  seed.close();
}

function execBody(daemon: DaemonInstance, argv: string[], cwd: string, sessionId: string | null): unknown {
  return { token: daemon.token, argv, context: { cwd, sessionId } };
}

test('ACC-04: first claimed use creates exactly one binding and reuse resolves to it', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-bind-first-${nextIndex()}`));
  initFixtureRepo(root);
  const daemon = await createDaemon(root, await freePort(), { commandPort: spyPort(), signalPort: fakeSignalPort() });
  try {
    const first = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], root, 'S-BIND-1'));
    assert.equal(first.statusCode, 200, `body: ${first.body}`);
    let rows = daemon.store.orm.select().from(bindingRows).all();
    assert.equal(rows.length, 1, 'first use creates exactly one binding');
    assert.equal(rows[0]?.sessionId, 'S-BIND-1');
    assert.equal(norm(rows[0].workspace), norm(root));

    const reuse = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], root, 'S-BIND-1'));
    assert.equal(reuse.statusCode, 200, `body: ${reuse.body}`);
    rows = daemon.store.orm.select().from(bindingRows).all();
    assert.equal(rows.length, 1, 'reuse must not create a second binding');
  } finally { await stopQuietly(daemon); }
});

test('ACC-04: a mismatched session claim is rejected before any store mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-bind-mismatch-${nextIndex()}`));
  initFixtureRepo(root);
  seedPacket('BIND-P1', root);
  const daemon = await startDaemon(root, await freePort());
  try {
    const first = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], root, 'S-BIND-1'));
    assert.equal(first.statusCode, 200, `body: ${first.body}`);

    const bad = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['task', 'note', 'BIND-P1', 'mutate'], root, 'S-OTHER'));
    assert.equal(bad.statusCode, 400, `body: ${bad.body}`);
    assert.ok(bad.body.includes('invalid context'), `body: ${bad.body}`);

    assert.equal(daemon.store.orm.select().from(taskEvents).all().length, 0, 'no event written after a rejected claim');
    const rows = daemon.store.orm.select().from(bindingRows).all();
    assert.equal(rows.length, 1, 'binding table unchanged');
    assert.equal(rows[0]?.sessionId, 'S-BIND-1', 'existing binding unchanged');
  } finally { await stopQuietly(daemon); }
});

test('ACC-04: a null claim against an existing binding is rejected before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-bind-null-${nextIndex()}`));
  initFixtureRepo(root);
  const port = spyPort();
  const daemon = await createDaemon(root, await freePort(), { commandPort: port, signalPort: fakeSignalPort() });
  try {
    const first = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], root, 'S-BIND-1'));
    assert.equal(first.statusCode, 200, `body: ${first.body}`);
    const bad = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], root, null));
    assert.equal(bad.statusCode, 400, `body: ${bad.body}`);
    assert.equal(port.executed(), 1, 'only the first request may execute');
  } finally { await stopQuietly(daemon); }
});

test('ACC-04: a workspace outside the repository is rejected before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-bind-inside-${nextIndex()}`));
  initFixtureRepo(root);
  const outside = await mkdtemp(join(tmpdir(), `svp-bind-outside-${nextIndex()}`));
  initFixtureRepo(outside);
  const port = spyPort();
  const daemon = await createDaemon(root, await freePort(), { commandPort: port, signalPort: fakeSignalPort() });
  try {
    const bad = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], outside, null));
    assert.equal(bad.statusCode, 400, `body: ${bad.body}`);
    assert.ok(bad.body.includes('invalid context'), `body: ${bad.body}`);
    assert.equal(port.executed(), 0, 'rejected before the command port runs');
    assert.equal(daemon.store.orm.select().from(bindingRows).all().length, 0, 'no binding created');
  } finally { await stopQuietly(daemon); }
});

test('ACC-04: a claim naming a session that belongs to another workspace is rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-bind-foreign-${nextIndex()}`));
  initFixtureRepo(root);
  const wt2 = join(root, 'wt2');
  execFileSync('git', ['branch', 'foreign-b2'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt2, 'foreign-b2'], { cwd: root });
  seedPacket('FOREIGN-P1', root);
  const daemon = await startDaemon(root, await freePort());
  try {
    const started = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['task', 'start', 'FOREIGN-P1'], root, null));
    assert.equal(started.statusCode, 200, `body: ${started.body}`);
    const sessions = daemon.store.orm.select().from(sessionRows).all();
    assert.equal(sessions.length, 1, 'task start minted one session');
    const minted = sessions[0]?.id;
    assert.ok(minted !== undefined);

    const bad = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], wt2, minted));
    assert.equal(bad.statusCode, 400, `claiming another workspace's session must be rejected: ${bad.body}`);
    assert.equal(daemon.store.orm.select().from(bindingRows).all().length, 0, 'no binding created for the foreign claim');
  } finally { await stopQuietly(daemon); }
});

test('ACC-05: canonical aliases resolve to the same workspace binding', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-bind-alias-${nextIndex()}`));
  initFixtureRepo(root);
  const sub = join(root, 'sub');
  await mkdir(sub);
  const daemon = await createDaemon(root, await freePort(), { commandPort: spyPort(), signalPort: fakeSignalPort() });
  try {
    const first = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], root, 'S-BIND-1'));
    assert.equal(first.statusCode, 200, `body: ${first.body}`);
    const alias = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], sub, 'S-BIND-1'));
    assert.equal(alias.statusCode, 200, `a subdirectory must resolve to the root binding: ${alias.body}`);
    assert.equal(daemon.store.orm.select().from(bindingRows).all().length, 1, 'aliases share one binding');
    const wrong = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, execBody(daemon, ['status'], sub, 'S-WRONG'));
    assert.equal(wrong.statusCode, 400, 'a mismatched claim through an alias must be rejected');
  } finally { await stopQuietly(daemon); }
});

test('ACC-05: commands from a subdirectory reuse the worktree session instead of minting a duplicate', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-canon-${nextIndex()}`));
  initFixtureRepo(root);
  const sub = join(root, 'sub');
  await mkdir(sub);
  seedPacket('CANON-P1', root);
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const started = await spawnCollect(process.execPath, binPath, ['task', 'start', 'CANON-P1'], root);
  assert.equal(started.status, 0, `start failed: ${started.stderr}`);
  const noted = await spawnCollect(process.execPath, binPath, ['task', 'note', 'CANON-P1', 'from-subdir'], sub);
  assert.equal(noted.status, 0, `note failed: ${noted.stderr}`);

  const store = openStore(root);
  const sessions = store.orm.select().from(sessionRows).all();
  const transitions = store.orm.select().from(transitionRows).all();
  const events = store.orm.select().from(taskEvents).all();
  store.close();
  assert.equal(sessions.length, 1, `one session identity for the worktree, got ${sessions.length}`);
  const sessionId = sessions[0]?.id;
  assert.ok(sessionId !== undefined);
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0]?.sessionId, sessionId, 'start transition maps to the single session');
  assert.equal(events.length, 2, 'one transition event and one note event');
  for (const event of events) assert.equal(event.sessionId, sessionId, 'every event maps to the single session');
});
