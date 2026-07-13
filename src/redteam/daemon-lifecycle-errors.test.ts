import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../db/store.js';
import { startDaemon } from '../daemon/daemon.js';
import { createCliCommandExecutionPort } from '../daemon/adapters/cli-command-execution.js';
import { createNodeHttpServerFactory } from '../daemon/adapters/node-http-server.js';
import { createNodeSignalSubscription } from '../daemon/adapters/node-signal-subscription.js';
const cliCommandPort = createCliCommandExecutionPort();
const realHttpFactory = createNodeHttpServerFactory();
import { gitWorkspace } from '../runtime/workspace-git.js';
import { freePort, initFixtureRepo, nextIndex } from './daemon-test-utils.js';
import { createStoreSessionBinding } from '../daemon/adapters/local-store-session-binding.js';
const sessionBinding = createStoreSessionBinding();
import { cf, ControllableServer } from './daemon-lifecycle-helpers.js';

// ---- 9. Real signal port register/unregister --
test('red team: signal port registers once and unregisters once after done (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-sig-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();

  const signals = createNodeSignalSubscription();
  const events: string[] = [];
  const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: realHttpFactory, sessionBinding });
  const shutdown = () => { void daemon.stop(); };

  signals.onShutdown(shutdown);
  events.push('on');

  await daemon.stop();
  signals.removeShutdownHandler(shutdown);
  events.push('off');

  assert.deepEqual(events, ['on', 'off'], 'on then off exactly once');
});

// ---- 10. Post-start server error --
test('red team: post-start server error produces done->{kind:failed,error}, exactly-once finalize (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-srv-err-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; }, sessionBinding });
  sv.induceError(new Error('induced'));
  sv.releaseClose();
  const o = await d.done;
  assert.equal(o.kind, 'failed');
  assert.ok(o.error.message.includes('induced'));
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
  assert.equal(d.state(), 'stopped');
});

// ---- 11. Close rejection: secondary, causal failure preserved --
test('red team: close rejection is secondary — causal failure still wins (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-close-rej-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer({ rejectCloseWith: new Error('close-failed') });
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; }, sessionBinding });
  sv.induceError(new Error('causal'));
  sv.releaseClose();
  const o = await d.done;
  assert.equal(o.kind, 'failed');
  assert.equal(o.error.message, 'causal', 'causal error not overwritten by close rejection');
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ---- 12. Finalize throw: causal failure preserved --
test('red team: finalize throw is secondary — causal failure still wins (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-fin-throw-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv),
    sessionBinding,
    onFinalize: () => { fc++; throw new Error('finalize-boom'); },
  });
  sv.induceError(new Error('causal'));
  sv.releaseClose();
  const o = await d.done;
  assert.equal(o.kind, 'failed');
  assert.equal(o.error.message, 'causal', 'causal error not overwritten by finalize throw');
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ---- 13. Clean stop + close rejection: upgrades stopped -> failed ----
test('red team: clean stop with close rejection upgrades outcome to failed (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-clean-close-rej-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer({ rejectCloseWith: new Error('close-failed') });
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; }, sessionBinding });
  const sp = d.stop();
  sv.releaseClose();
  const o = await sp;
  assert.equal(o.kind, 'failed', 'close rejection must upgrade clean stop to failed');
  assert.ok(o.error.message.includes('close-failed'), `error must mention close failure: ${o.error.message}`);
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ---- 14. Clean stop + finalize throw: upgrades stopped -> failed ----
test('red team: clean stop with finalize throw upgrades outcome to failed (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-clean-fin-throw-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv),
    sessionBinding,
    onFinalize: () => { fc++; throw new Error('finalize-boom'); },
  });
  const sp = d.stop();
  sv.releaseClose();
  const o = await sp;
  assert.equal(o.kind, 'failed', 'finalize throw must upgrade clean stop to failed');
  assert.ok(o.error.message.includes('finalize'), `error must mention finalize failure: ${o.error.message}`);
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});
