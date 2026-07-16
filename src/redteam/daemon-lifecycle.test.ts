import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDaemonStore } from '../db/store.js';
import { createDaemon } from '../daemon/daemon.js';
import type { DaemonDeps, DaemonInstance } from '../daemon/daemon.types.js';
import { DAEMON_LOCK_FILE, DAEMON_TOKEN_FILE } from '../daemon/daemon.constants.js';
import { SVP_DIR } from '../db/store.constants.js';
import type { CommandPort, SignalPort } from '../runtime/context.types.js';
import { freePort, initFixtureRepo, nextIndex, prop, withDeadline } from './daemon-test-utils.test.support.js';

const LISTEN_TIMEOUT_MS = 5000;

interface FakeSignals extends SignalPort {
  emit(signal: string): void;
  unsubscribeCount(): number;
}

function fakeSignals(onUnsubscribe?: () => void): FakeSignals {
  let handler: ((signal: string) => void) | null = null;
  let unsubscriptions = 0;
  return {
    subscribe(h) {
      handler = h;
      return () => { unsubscriptions += 1; onUnsubscribe?.(); };
    },
    emit(signal) { handler?.(signal); },
    unsubscribeCount() { return unsubscriptions; },
  };
}

const noopCommandPort: CommandPort = { execute: () => Promise.resolve(0) };

function testDeps(signalPort: SignalPort): DaemonDeps {
  return { commandPort: noopCommandPort, signalPort };
}

async function startTestDaemon(): Promise<{ root: string; daemon: DaemonInstance; signals: FakeSignals }> {
  const root = await mkdtemp(join(tmpdir(), `svp-lifecycle-${nextIndex()}`));
  initFixtureRepo(root);
  const signals = fakeSignals();
  const daemon = await createDaemon(root, await freePort(), testDeps(signals));
  return { root, daemon, signals };
}

async function stopQuietly(daemon: DaemonInstance): Promise<void> {
  await daemon.stop().then(() => undefined, () => undefined);
}

test('ACC-08: listen failure rejects the start promise with a typed error after cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-listen-${nextIndex()}`));
  initFixtureRepo(root);
  const port = await freePort();
  const blocker = createNetServer();
  await new Promise<void>((resolve) => { blocker.listen(port, '127.0.0.1', () => { resolve(); }); });
  try {
    const start = createDaemon(root, port, testDeps(fakeSignals()));
    const error = await withDeadline(
      start.then(() => null, (e: unknown) => e),
      LISTEN_TIMEOUT_MS,
      'start promise hung after listen failure',
    );
    assert.ok(error instanceof Error, 'listen failure must reject with an error');
    assert.equal(prop(error, 'name'), 'DaemonListenError', 'listen failure must be a typed error');
    assert.ok(!existsSync(join(root, SVP_DIR, DAEMON_LOCK_FILE)), 'lock file removed before rejection');
    assert.ok(!existsSync(join(root, SVP_DIR, DAEMON_TOKEN_FILE)), 'token file removed before rejection');
    assert.equal(getDaemonStore(), null, 'daemon store released before rejection');
  } finally {
    await new Promise<void>((resolve) => { blocker.close(() => { resolve(); }); });
  }
});

test('ACC-08: stop resolves with the terminal shutdown receipt', async () => {
  const { daemon } = await startTestDaemon();
  const receipt: unknown = await daemon.stop();
  assert.equal(prop(receipt, 'cause'), 'shutdown requested');
  assert.equal(prop(receipt, 'clean'), true);
  assert.equal(prop(receipt, 'causal'), undefined);
});

test('ACC-08: cleanup failure is recorded on the receipt instead of being swallowed', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-cleanup-${nextIndex()}`));
  initFixtureRepo(root);
  const signals = fakeSignals(() => { throw new Error('unsub-boom'); });
  const daemon = await createDaemon(root, await freePort(), testDeps(signals));
  const receipt: unknown = await daemon.stop();
  assert.equal(prop(receipt, 'clean'), false, 'cleanup failure must mark the receipt not-clean');
  assert.equal(prop(prop(receipt, 'causal'), 'message'), 'unsub-boom');
  assert.equal(signals.unsubscribeCount(), 1, 'unsubscribe attempted exactly once');
});

test('ACC-08: repeated failures preserve the first causal error', async () => {
  const { daemon, signals } = await startTestDaemon();
  signals.emit('SIGTERM');
  signals.emit('SIGINT');
  const receipt: unknown = await daemon.stop();
  assert.equal(prop(receipt, 'clean'), false);
  assert.equal(prop(prop(receipt, 'causal'), 'message'), 'received SIGTERM', 'first causal failure wins');
  assert.equal(signals.unsubscribeCount(), 1, 'finalization ran exactly once');
});

test('ACC-08: an error after stop begins is preserved on the receipt', async () => {
  const { daemon, signals } = await startTestDaemon();
  const stopP = daemon.stop();
  signals.emit('SIGTERM');
  const receipt: unknown = await stopP;
  assert.equal(prop(receipt, 'clean'), false);
  assert.equal(prop(prop(receipt, 'causal'), 'message'), 'received SIGTERM');
});

test('ACC-08: stop after an error preserves the failure receipt', async () => {
  const { daemon, signals } = await startTestDaemon();
  signals.emit('SIGTERM');
  const receipt: unknown = await daemon.stop();
  assert.equal(prop(receipt, 'clean'), false);
  assert.equal(prop(prop(receipt, 'causal'), 'message'), 'received SIGTERM');
});

test('ACC-08: repeated stop returns the same receipt and finalizes once', async () => {
  const { daemon, signals } = await startTestDaemon();
  const first: unknown = await daemon.stop();
  const second: unknown = await daemon.stop();
  assert.strictEqual(first, second, 'terminal receipt is computed exactly once');
  assert.equal(signals.unsubscribeCount(), 1);
  assert.equal(getDaemonStore(), null, 'daemon store released');
  await stopQuietly(daemon);
});
