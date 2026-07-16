import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { openStore } from '../db/store.js';
import { createDaemon, startDaemon } from '../daemon/daemon.js';
import type { DaemonInstance } from '../daemon/daemon.types.js';
import { DAEMON_ROUTE } from '../daemon/daemon.constants.js';
import { packets } from '../tasks/schema.constants.js';
import { SESSION_FILE_NAME, STATUS } from '../tasks/service.constants.js';
import { OS_PLATFORM } from '../platform.constants.js';
import type { CommandPort, ExecutionContext, SignalPort } from '../runtime/context.types.js';
import { getContext } from '../runtime/context.js';
import { freePort, initFixtureRepo, nextIndex, postJson, prop } from './daemon-test-utils.test.support.js';

const sessionRows = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  worktree: text('worktree').notNull(),
});

const transitionRows = sqliteTable('transitions', {
  packetId: text('packet_id').notNull(),
  toStatus: text('to_status').notNull(),
  sessionId: text('session_id'),
});

function norm(path: string): string {
  const resolved = resolve(path);
  return process.platform === OS_PLATFORM.WINDOWS ? resolved.toLowerCase() : resolved;
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

function spyPort(onExecute?: () => void): SpyPort {
  let count = 0;
  return {
    execute: () => { count += 1; onExecute?.(); return Promise.resolve(0); },
    executed: () => count,
  };
}

async function startSpyDaemon(root: string, port: SpyPort): Promise<DaemonInstance> {
  return await createDaemon(root, await freePort(), { commandPort: port, signalPort: fakeSignalPort() });
}

// Run the shipped sync transport (client.js forwardToDaemonSync) from a child
// process — exactly how production auto-forwarding uses it.
const CLIENT_URL = new URL('../daemon/client.js', import.meta.url).href;
function runForwardInChild(argv: string[], token: string, port: number, cwd: string): Promise<number> {
  const script = `const { forwardToDaemonSync } = await import(${JSON.stringify(CLIENT_URL)});process.exit(forwardToDaemonSync(${JSON.stringify(argv)}, ${JSON.stringify(token)}, ${port}));`;
  return new Promise((resolveChild) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => { resolveChild(code ?? 1); });
  });
}

test('ACC-03: first-use exec with an explicit null sessionId succeeds', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-ctx-null-${nextIndex()}`));
  initFixtureRepo(root);
  const daemon = await startSpyDaemon(root, spyPort());
  try {
    const res = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['status'], context: { cwd: root, sessionId: null } });
    assert.equal(res.statusCode, 200, `body: ${res.body}`);
  } finally { await stopQuietly(daemon); }
});

test('ACC-03: an omitted sessionId is rejected before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-ctx-omit-${nextIndex()}`));
  initFixtureRepo(root);
  const port = spyPort();
  const daemon = await startSpyDaemon(root, port);
  try {
    const res = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['status'], context: { cwd: root } });
    assert.equal(res.statusCode, 400, `body: ${res.body}`);
    assert.ok(res.body.includes('invalid context'), `body: ${res.body}`);
    assert.equal(port.executed(), 0, 'rejected before the command port runs');
  } finally { await stopQuietly(daemon); }
});

test('ACC-03: an empty-string sessionId is rejected before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-ctx-empty-${nextIndex()}`));
  initFixtureRepo(root);
  const port = spyPort();
  const daemon = await startSpyDaemon(root, port);
  try {
    const res = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['status'], context: { cwd: root, sessionId: '' } });
    assert.equal(res.statusCode, 400, `body: ${res.body}`);
    assert.equal(port.executed(), 0);
  } finally { await stopQuietly(daemon); }
});

test('ACC-03: a non-string sessionId is rejected before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-ctx-num-${nextIndex()}`));
  initFixtureRepo(root);
  const port = spyPort();
  const daemon = await startSpyDaemon(root, port);
  try {
    const res = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['status'], context: { cwd: root, sessionId: 42 } });
    assert.equal(res.statusCode, 400, `body: ${res.body}`);
    assert.equal(port.executed(), 0);
  } finally { await stopQuietly(daemon); }
});

test('ACC-03: a missing context is rejected before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-ctx-none-${nextIndex()}`));
  initFixtureRepo(root);
  const port = spyPort();
  const daemon = await startSpyDaemon(root, port);
  try {
    const res = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['status'] });
    assert.equal(res.statusCode, 400, `body: ${res.body}`);
    assert.ok(res.body.includes('invalid context'), `body: ${res.body}`);
    assert.equal(port.executed(), 0);
  } finally { await stopQuietly(daemon); }
});

test('ACC-03: a non-string cwd is rejected before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-ctx-cwd-${nextIndex()}`));
  initFixtureRepo(root);
  const port = spyPort();
  const daemon = await startSpyDaemon(root, port);
  try {
    const res = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['status'], context: { cwd: 123, sessionId: null } });
    assert.equal(res.statusCode, 400, `body: ${res.body}`);
    assert.equal(port.executed(), 0);
  } finally { await stopQuietly(daemon); }
});

test('ACC-03: the production forwarding transport carries the persisted session id', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-ctx-transport-${nextIndex()}`));
  initFixtureRepo(root);
  let seen: ExecutionContext | undefined;
  const commandPort: CommandPort = { execute: () => { seen = getContext(); return Promise.resolve(0); } };
  const daemon = await createDaemon(root, await freePort(), { commandPort, signalPort: fakeSignalPort() });
  try {
    await writeFile(join(root, SESSION_FILE_NAME), 'S-transport-1\n', 'utf8');
    const code = await runForwardInChild(['status'], daemon.token, daemon.port, root);
    assert.equal(code, 0, 'forwarded command must succeed');
    assert.ok(seen !== undefined, 'command port must observe a context');
    assert.equal(prop(seen, 'sessionId'), 'S-transport-1', 'transport must read .svp/session');
    assert.equal(norm(String(prop(seen, 'cwd'))), norm(root));
  } finally { await stopQuietly(daemon); }
});

test('ACC-06: concurrent forwarded commands keep event-to-session binding per worktree', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-iso-${nextIndex()}`));
  initFixtureRepo(root);
  const wt1 = join(root, 'wt1');
  const wt2 = join(root, 'wt2');
  execFileSync('git', ['branch', 'iso-b1'], { cwd: root });
  execFileSync('git', ['branch', 'iso-b2'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt1, 'iso-b1'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt2, 'iso-b2'], { cwd: root });
  const ISO_P1 = 'ISO-P1';
  const ISO_P2 = 'ISO-P2';
  const now = new Date().toISOString();
  const seed = openStore(root);
  seed.orm.insert(packets).values([
    { id: ISO_P1, title: 'Isolation 1', path: '/tmp', status: 'ready', body: '', writeSetJson: '[]', type: '', priority: 100, createdAt: now, updatedAt: now },
    { id: ISO_P2, title: 'Isolation 2', path: '/tmp', status: 'ready', body: '', writeSetJson: '[]', type: '', priority: 100, createdAt: now, updatedAt: now },
  ]).run();
  seed.close();

  const daemon = await startDaemon(root, await freePort());
  try {
    const [r1, r2] = await Promise.all([
      postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['task', 'start', ISO_P1], context: { cwd: wt1, sessionId: null } }),
      postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['task', 'start', ISO_P2], context: { cwd: wt2, sessionId: null } }),
    ]);
    assert.equal(r1.statusCode, 200, `wt1: ${r1.body}`);
    assert.equal(r2.statusCode, 200, `wt2: ${r2.body}`);
    assert.equal(prop(JSON.parse(r1.body), 'exitCode'), 0, `wt1: ${r1.body}`);
    assert.equal(prop(JSON.parse(r2.body), 'exitCode'), 0, `wt2: ${r2.body}`);

    const sessions = daemon.store.orm.select().from(sessionRows).all();
    assert.equal(sessions.length, 2, 'exactly two sessions, one per worktree');
    const worktrees = sessions.map((s) => norm(s.worktree));
    assert.ok(worktrees.includes(norm(realpathSync(wt1))), `wt1 session missing: ${worktrees.join(', ')}`);
    assert.ok(worktrees.includes(norm(realpathSync(wt2))), `wt2 session missing: ${worktrees.join(', ')}`);

    const transitions = daemon.store.orm.select().from(transitionRows).all();
    const started = transitions.filter((t) => t.toStatus === STATUS.ACTIVE);
    assert.equal(started.length, 2, 'exactly two start transitions');
    const worktreeOf = new Map(sessions.map((s) => [s.id, norm(s.worktree)]));
    for (const transition of started) {
      const expected = transition.packetId === ISO_P1 ? norm(realpathSync(wt1)) : norm(realpathSync(wt2));
      assert.equal(worktreeOf.get(transition.sessionId ?? ''), expected, `${transition.packetId} must map to its own worktree session`);
    }
  } finally { await stopQuietly(daemon); }
});
