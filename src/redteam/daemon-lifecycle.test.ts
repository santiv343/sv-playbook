import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../db/store.js';
import { startDaemon } from '../daemon/daemon.js';
import { createCliCommandExecutionPort } from '../cli/daemon-adapter.js';
import { createNodeHttpServerFactory } from '../cli/http-server-adapter.js';
const cliCommandPort = createCliCommandExecutionPort();
const httpServerFactory = createNodeHttpServerFactory();
import { gitWorkspace } from '../runtime/workspace-git.js';
import { freePort, initFixtureRepo, postJson, nextIndex } from './daemon-test-utils.js';
import type { HttpServerFactoryPort, HttpServerPort } from '../daemon/daemon.types.js';

// ---- STORE-003: Active-handler shutdown drain (deterministic barrier) ----
test('red team: stop drains in-flight exec handlers — deterministic barrier (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-drain-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();

  let barrierRelease: (() => void) = () => {};
  let barrierReady: (() => void) = () => {};
  const barrierReadyPromise = new Promise<void>((resolve) => { barrierReady = resolve; });
  const barrierWaitPromise = new Promise<void>((resolve) => { barrierRelease = resolve; });

  const daemon = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, httpServerFactory,
    commandExecution: {
      async execute(req) {
        if (req.argv[0] === '__barrier__') {
          barrierReady();
          await barrierWaitPromise;
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return cliCommandPort.execute(req);
      },
    },
  });

  const execPromise = postJson(port, '/api/v1/exec', {
    token: daemon.token, argv: ['__barrier__'], context: { cwd: root },
  }, 15000);

  await Promise.race([
    barrierReadyPromise,
    new Promise<void>((_, reject) => { setTimeout(() => { reject(new Error('barrier not entered within 10s')); }, 10000); }),
  ]);

  const stopPromise = daemon.stop();
  const race = await Promise.race([stopPromise.then(() => 'resolved' as const), new Promise<string>((r) => { setTimeout(() => { r('timeout'); }, 500); })]);
  assert.equal(race, 'timeout', 'stop must NOT resolve while barrier is in-flight');
  barrierRelease();
  const outcome = await stopPromise;
  assert.equal(outcome.kind, 'stopped', 'stop must resolve with kind=stopped');

  const execResponse = await execPromise;
  assert.equal(execResponse.statusCode, 200, `exec must complete, got ${execResponse.statusCode}`);
  const parsed: unknown = JSON.parse(execResponse.body);
  assert.ok(typeof parsed === 'object' && parsed !== null);
  assert.equal(Reflect.get(parsed, 'exitCode'), 0, `exec must succeed, got ${execResponse.body}`);
});

test('red team: exec requests are rejected with 503 or connection refused after stop (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-stop-rej-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory });

  await daemon.stop();

  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: root } });
    assert.ok(res.statusCode === 503, `after stop, exec must return 503, got ${res.statusCode}: ${res.body}`);
    assert.ok(res.body.includes('unavailable'), `503 body must mention unavailable, got: ${res.body}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    assert.ok(msg.includes('ECONNREFUSED') || msg.includes('connection refused'), `after stop, exec must be refused or return 503, got: ${msg}`);
  }
});

test('red team: post-start server error produces done->{kind:failed,error}, exactly-once finalize (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-srv-err-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let errorHandlerRef: ((err: Error) => void) | null = null;
  let finalizeCount = 0;
  let closeCount = 0;

  class FakeServer implements HttpServerPort {
    private real = createHttpServer();
    async listen(port: number, host: string): Promise<void> {
      this.real.on('error', (err) => errorHandlerRef?.(err));
      return new Promise((r) => this.real.listen(port, host, r));
    }
    close() { closeCount++; return new Promise<void>((r) => { this.real.close(() => { r(); }); }); }
    onError(handler: (err: Error) => void) { errorHandlerRef = handler; }
    induceError(err: Error) { errorHandlerRef?.(err); }
  }
  const fakeServer = new FakeServer();
  const fakeFactory: HttpServerFactoryPort = { create: () => fakeServer };

  const daemon = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort,
    httpServerFactory: fakeFactory,
    onFinalize: () => { finalizeCount++; },
  });

  fakeServer.induceError(new Error('induced server failure'));

  const outcome = await daemon.done;
  assert.equal(outcome.kind, 'failed', 'server error must produce failed outcome');
  assert.ok(outcome.error.message.includes('induced'), `error must carry message, got: ${outcome.error.message}`);
  assert.equal(closeCount, 1, 'listener close must be called exactly once');
  assert.equal(finalizeCount, 1, 'finalize must run exactly once on post-start error');
  assert.equal(daemon.state(), 'stopped', 'state must be stopped after error');
});
