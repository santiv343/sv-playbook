import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../db/store.js';
import { startDaemon } from '../daemon/daemon.js';
import { createCliCommandExecutionPort } from '../daemon/adapters/cli-command-execution.js';
import { createNodeHttpServerFactory } from '../daemon/adapters/node-http-server.js';
const cliCommandPort = createCliCommandExecutionPort();
const realHttpFactory = createNodeHttpServerFactory();
import { gitWorkspace } from '../runtime/workspace-git.js';
import { freePort, initFixtureRepo, postJson, nextIndex } from './daemon-test-utils.js';
import { createStoreSessionBinding } from '../daemon/adapters/local-store-session-binding.js';
const sessionBinding = createStoreSessionBinding();
import { cf, ControllableServer } from './daemon-lifecycle-helpers.js';

// ---- STORE-003: Active-handler shutdown drain (deterministic barrier) ----
test('red team: stop drains in-flight exec handlers — deterministic barrier (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-drain-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();

  let markReady: (() => void) = () => {};
  let releaseBarrier: (() => void) = () => {};
  const readyPromise = new Promise<void>((r) => { markReady = r; });
  const barrierPromise = new Promise<void>((r) => { releaseBarrier = r; });

  const sv = new ControllableServer();
  const daemon = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, httpServerFactory: cf(sv),
    commandExecution: {
      async execute(req) {
        if (req.argv[0] === '__barrier__') { markReady(); await barrierPromise; return { exitCode: 0, stdout: '', stderr: '' }; }
        return cliCommandPort.execute(req);
      },
    },
    sessionBinding,
  });

  try {
    const ep = postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['__barrier__'], context: { cwd: root } }, 15000);
    await readyPromise;

    const events: string[] = [];
    const sp = daemon.stop().then((o) => { events.push('stop'); return o; });
    const er = ep.then((r) => { events.push('exec'); return r; });

    await sv.closeStarted;
    assert.equal(events.length, 0, 'nothing before barrier release');

    releaseBarrier();
    sv.releaseClose();
    const outcome = await sp;
    assert.equal(outcome.kind, 'stopped');

    const eresp = await er;
    assert.equal(eresp.statusCode, 200);
    const p: unknown = JSON.parse(eresp.body);
    assert.ok(typeof p === 'object' && p !== null);
    assert.equal(Reflect.get(p, 'exitCode'), 0);
    assert.equal(events[0], 'exec', 'exec response before stop');
    assert.equal(events[1], 'stop', 'stop after exec');
  } finally { await daemon.stop(); }
});

// ---- 2. Exec rejected 503 after stop --
test('red team: exec requests are rejected with 503 or connection refused after stop (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-stop-rej-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: realHttpFactory, sessionBinding });
  await d.stop();
  try {
    const r = await postJson(port, '/api/v1/exec', { token: d.token, argv: ['describe'], context: { cwd: root } });
    assert.ok(r.statusCode === 503, `expected 503, got ${r.statusCode}`);
    assert.ok(r.body.includes('unavailable'));
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    assert.ok(m.includes('ECONNREFUSED') || m.includes('connection refused'));
  }
});

// ---- 3. Repeated errors: once, first preserved --
test('red team: repeated post-start errors — once close+finalize, first error preserved (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-rep-err-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; }, sessionBinding });
  sv.induceError(new Error('first'));
  sv.induceError(new Error('second'));
  sv.releaseClose();
  const o = await d.done;
  assert.equal(o.kind, 'failed');
  assert.equal(o.error.message, 'first');
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ---- 4. Stop->error before close: error wins --
test('red team: stop then error before close — outcome fails, not stops (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-stop-err-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; }, sessionBinding });
  void d.stop();
  await sv.closeStarted;
  sv.induceError(new Error('close-error'));
  sv.releaseClose();
  const o = await d.done;
  assert.equal(o.kind, 'failed');
  assert.equal(o.error.message, 'close-error');
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ---- 5. Error->stop: outcome stays failed --
test('red team: error then stop — stop must not overwrite failed outcome (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-err-stop-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; }, sessionBinding });
  sv.induceError(new Error('first-fail'));
  await sv.closeStarted;
  void d.stop();
  sv.releaseClose();
  const o = await d.done;
  assert.equal(o.kind, 'failed');
  assert.equal(o.error.message, 'first-fail');
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ---- 6. Listen rejection: rejects after close+finalize --
test('red team: listen rejection rejects after close+finalize, not early (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-listen-rej-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer({ rejectListenWith: new Error('port in use') });
  const dp = startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; }, sessionBinding });
  await sv.closeStarted;
  sv.releaseClose();
  await assert.rejects(dp, /port in use/);
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ---- 7. HTTP 500 stable error, no detail leak --
test('red team: exec port rejection returns HTTP 500 with stable error, no detail leak (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-500-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const d = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, httpServerFactory: realHttpFactory,
    commandExecution: { execute() { throw new Error('inter-secret'); } },
    sessionBinding,
  });
  try {
    const r = await postJson(port, '/api/v1/exec', { token: d.token, argv: ['x'], context: { cwd: root } });
    assert.equal(r.statusCode, 500, `expected 500 got ${r.statusCode}: ${r.body}`);
    assert.ok(r.body.includes('rejected'), `body: ${r.body}`);
    assert.ok(!r.body.includes('secret'), `body leaked detail: ${r.body}`);
  } finally {
    await d.stop();
  }
});
