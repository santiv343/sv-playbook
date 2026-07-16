import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDaemon, startDaemon } from '../daemon/daemon.js';
import type { DaemonDeps, DaemonInstance } from '../daemon/daemon.types.js';
import { DAEMON_ROUTE } from '../daemon/daemon.constants.js';
import type { CommandPort, SignalPort } from '../runtime/context.types.js';
import { freePort, initFixtureRepo, isConnectionRefused, nextIndex, postJson, prop } from './daemon-test-utils.test.support.js';

const BARRIER_COMMAND = '__barrier__';

function fakeSignalPort(): SignalPort {
  return { subscribe: () => () => {} };
}

function depsWith(commandPort: CommandPort): DaemonDeps {
  return { commandPort, signalPort: fakeSignalPort() };
}

async function stopQuietly(daemon: DaemonInstance): Promise<void> {
  await daemon.stop().then(() => undefined, () => undefined);
}

test('ACC-09: stop drains an accepted in-flight handler before resolving; new work is rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-drain-${nextIndex()}`));
  initFixtureRepo(root);
  let markReady: () => void = () => {};
  let releaseBarrier: () => void = () => {};
  const handlerReady = new Promise<void>((resolve) => { markReady = resolve; });
  const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
  const commandPort: CommandPort = {
    execute: (argv) => {
      if (argv[0] === BARRIER_COMMAND) { markReady(); return barrier.then(() => 0); }
      return Promise.resolve(0);
    },
  };
  const daemon = await createDaemon(root, await freePort(), depsWith(commandPort));
  const port = daemon.port;
  let stopResolved = false;
  try {
    const execP = postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: [BARRIER_COMMAND], context: { cwd: root, sessionId: null } });
    await handlerReady;
    const stopP = daemon.stop().then((receipt) => { stopResolved = true; return receipt; });

    // Deterministic proof that stopping began while the handler is in flight:
    // fresh work is rejected — either with a 503 (connection accepted before
    // close) or at the transport level (listener already closed).
    let lateRejected = false;
    try {
      const late = await postJson(port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['status'], context: { cwd: root, sessionId: null } });
      assert.equal(late.statusCode, 503, `expected 503, got ${late.statusCode}`);
      assert.ok(late.body.includes('shutting down'), `body: ${late.body}`);
      lateRejected = true;
    } catch (error: unknown) {
      assert.ok(isConnectionRefused(error), `expected 503 or connection refused, got ${String(error)}`);
      lateRejected = true;
    }
    assert.ok(lateRejected, 'new work must be rejected once stopping begins');
    assert.equal(stopResolved, false, 'stop must wait for the in-flight handler');

    releaseBarrier();
    const execResponse = await execP;
    assert.equal(execResponse.statusCode, 200, 'accepted handler completes');
    const receipt: unknown = await stopP;
    assert.equal(prop(receipt, 'clean'), true);
  } finally {
    releaseBarrier();
    await stopQuietly(daemon);
  }
});

test('ACC-09: exec after stop is rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-stop-rej-${nextIndex()}`));
  initFixtureRepo(root);
  const daemon = await createDaemon(root, await freePort(), depsWith({ execute: () => Promise.resolve(0) }));
  await daemon.stop();
  try {
    const response = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['status'], context: { cwd: root, sessionId: null } });
    assert.equal(response.statusCode, 503, `expected 503, got ${response.statusCode}`);
  } catch (error: unknown) {
    assert.ok(isConnectionRefused(error), `expected connection refused, got ${String(error)}`);
  }
  await stopQuietly(daemon);
});

test('ACC-10: a synchronous command-port failure returns a stable 500 without internal detail', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-500sync-${nextIndex()}`));
  initFixtureRepo(root);
  const commandPort: CommandPort = { execute: (): Promise<number> => { throw new Error('inter-secret'); } };
  const daemon = await createDaemon(root, await freePort(), depsWith(commandPort));
  try {
    const response = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['x'], context: { cwd: root, sessionId: null } });
    assert.equal(response.statusCode, 500, `expected 500, got ${response.statusCode}: ${response.body}`);
    assert.ok(response.body.includes('internal error'), `body: ${response.body}`);
    assert.ok(!response.body.includes('secret'), `body leaked detail: ${response.body}`);
  } finally {
    await stopQuietly(daemon);
  }
});

test('ACC-10: an async command-port rejection returns a stable 500 without internal detail', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-500async-${nextIndex()}`));
  initFixtureRepo(root);
  const commandPort: CommandPort = { execute: () => Promise.reject(new Error('async-secret')) };
  const daemon = await createDaemon(root, await freePort(), depsWith(commandPort));
  try {
    const response = await postJson(daemon.port, DAEMON_ROUTE.EXECUTE, { token: daemon.token, argv: ['x'], context: { cwd: root, sessionId: null } });
    assert.equal(response.statusCode, 500, `expected 500, got ${response.statusCode}: ${response.body}`);
    assert.ok(response.body.includes('internal error'), `body: ${response.body}`);
    assert.ok(!response.body.includes('secret'), `body leaked detail: ${response.body}`);
  } finally {
    await stopQuietly(daemon);
  }
});

test('ACC-11: the production signal binding subscribes once and unsubscribes once', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-signal-${nextIndex()}`));
  initFixtureRepo(root);
  const beforeInt = process.listenerCount('SIGINT');
  const beforeTerm = process.listenerCount('SIGTERM');
  const daemon = await startDaemon(root, await freePort());
  assert.equal(process.listenerCount('SIGINT'), beforeInt + 1, 'SIGINT subscribed exactly once');
  assert.equal(process.listenerCount('SIGTERM'), beforeTerm + 1, 'SIGTERM subscribed exactly once');
  await daemon.stop();
  assert.equal(process.listenerCount('SIGINT'), beforeInt, 'SIGINT unsubscribed after termination');
  assert.equal(process.listenerCount('SIGTERM'), beforeTerm, 'SIGTERM unsubscribed after termination');
});
