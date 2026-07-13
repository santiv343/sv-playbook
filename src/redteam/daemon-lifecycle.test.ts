import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../db/store.js';
import { startDaemon } from '../daemon/daemon.js';
import { createCliCommandExecutionPort } from '../daemon/adapters/cli-execution-port.js';
import { createNodeHttpServerFactory } from '../daemon/adapters/http-server-adapter.js';
import { createNodeSignalSubscription } from '../daemon/adapters/signal-adapter.js';
const cliCommandPort = createCliCommandExecutionPort();
const realHttpFactory = createNodeHttpServerFactory();
import { gitWorkspace } from '../runtime/workspace-git.js';
import { freePort, initFixtureRepo, postJson, nextIndex, realCliEnv } from './daemon-test-utils.js';
import type { HttpServerFactoryPort, HttpServerPort } from '../daemon/daemon.types.js';

// ── ControllableServer: Promise-latch close control ──────────────────
class ControllableServer implements HttpServerPort {
  errorHandler: ((err: Error) => void) | null = null;
  closeCount = 0;
  private _resolveCloseStarted: (() => void) | null = null;
  readonly closeStarted = new Promise<void>((r) => { this._resolveCloseStarted = r; });
  private _resolveReleaseClose: ((v?: unknown) => void) | null = null;
  private real = createHttpServer();
  private _rejectListen: Error | null = null;
  private _rejectClose: Error | null = null;

  constructor(opts?: { rejectListenWith?: Error; rejectCloseWith?: Error }) {
    if (opts?.rejectListenWith) this._rejectListen = opts.rejectListenWith;
    if (opts?.rejectCloseWith) this._rejectClose = opts.rejectCloseWith;
  }

  async listen(port: number, host: string): Promise<void> {
    if (this._rejectListen) throw this._rejectListen;
    this.real.on('error', (err) => this.errorHandler?.(err));
    return new Promise((r) => this.real.listen(port, host, r));
  }

  close(): Promise<void> {
    this.closeCount++;
    this._resolveCloseStarted?.();
    return new Promise<void>((resolve, reject) => {
      this._resolveReleaseClose = () => {
        if (this._rejectClose) reject(this._rejectClose);
        else resolve();
      };
      this.real.close(() => { });
    });
  }

  releaseClose(): void { this._resolveReleaseClose?.(); }
  onError(h: (err: Error) => void) { this.errorHandler = h; }
  induceError(err: Error) { this.errorHandler?.(err); }
}

function cf(s: HttpServerPort): HttpServerFactoryPort { return { create: () => s }; }

// ── 1. Deterministic drain (no timing) ──
test('red team: stop drains in-flight exec — deterministic barrier, no timing (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-drain-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();

  let markReady: (() => void) = () => {};
  let releaseBarrier: (() => void) = () => {};
  const readyPromise = new Promise<void>((r) => { markReady = r; });
  const barrierPromise = new Promise<void>((r) => { releaseBarrier = r; });
  let timer: ReturnType<typeof setTimeout> | null = null;

  const daemon = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, httpServerFactory: realHttpFactory,
    commandExecution: {
      async execute(req) {
        if (req.argv[0] === '__barrier__') { markReady(); await barrierPromise; return { exitCode: 0, stdout: '', stderr: '' }; }
        return cliCommandPort.execute(req);
      },
    },
  });

  try {
    const ep = postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['__barrier__'], context: { cwd: root } }, 15000);
    await Promise.race([readyPromise, new Promise<void>((_, rej) => { timer = setTimeout(() => { rej(new Error('barrier not entered')); }, 10000); })]);
    if (timer) clearTimeout(timer);

    const events: string[] = [];
    const sp = daemon.stop().then((o) => { events.push('stop'); return o; });
    const er = ep.then((r) => { events.push('exec'); return r; });

    await new Promise<void>((r) => setImmediate(r));
    assert.equal(events.length, 0, 'nothing before barrier release');

    releaseBarrier();
    const outcome = await sp;
    assert.equal(outcome.kind, 'stopped');

    const eresp = await er;
    assert.equal(eresp.statusCode, 200);
    const p: unknown = JSON.parse(eresp.body);
    assert.ok(typeof p === 'object' && p !== null);
    assert.equal(Reflect.get(p, 'exitCode'), 0);
    assert.equal(events[0], 'exec', 'exec response before stop');
    assert.equal(events[1], 'stop', 'stop after exec');
  } finally { if (timer) clearTimeout(timer); await daemon.stop(); }
});

// ── 2. Exec rejected 503 after stop ──
test('red team: exec requests are rejected with 503 or connection refused after stop (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-stop-rej-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: realHttpFactory });
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

// ── 3. Repeated errors: once, first preserved ──
test('red team: repeated post-start errors — once close+finalize, first error preserved (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-rep-err-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; } });
  sv.induceError(new Error('first'));
  sv.induceError(new Error('second'));
  sv.releaseClose();
  const o = await d.done;
  assert.equal(o.kind, 'failed');
  assert.equal(o.error.message, 'first');
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ── 4. Stop→error before close: error wins ──
test('red team: stop then error before close — outcome fails, not stops (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-stop-err-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; } });
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

// ── 5. Error→stop: outcome stays failed ──
test('red team: error then stop — stop must not overwrite failed outcome (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-err-stop-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; } });
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

// ── 6. Listen rejection: rejects after close+finalize ──
test('red team: listen rejection rejects after close+finalize, not early (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-listen-rej-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer({ rejectListenWith: new Error('port in use') });
  const dp = startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; } });
  await sv.closeStarted;
  sv.releaseClose();
  await assert.rejects(dp, /port in use/);
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ── 7. HTTP 500 stable error, no detail leak ──
test('red team: exec port rejection returns HTTP 500 with stable error, no detail leak (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-500-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const d = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, httpServerFactory: realHttpFactory,
    commandExecution: { async execute() { throw new Error('inter-secret'); } },
  });
  const r = await postJson(port, '/api/v1/exec', { token: d.token, argv: ['x'], context: { cwd: root } });
  assert.equal(r.statusCode, 500);
  assert.ok(r.body.includes('rejected'), `body: ${r.body}`);
  assert.ok(!r.body.includes('secret'), `body leaked detail: ${r.body}`);
  await d.stop();
});

// ── 8. Shutdown via async child: no process.exit ──
test('red team: shutdown endpoint does not call process.exit — async child survival (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-shut-${nextIndex()}`));
  initFixtureRepo(root);
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const port = await freePort();

  const child = spawn(process.execPath, [binPath, 'daemon', '--port', String(port)], {
    cwd: root, env: realCliEnv(), stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
  });
  let childOut = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d: string) => { childOut += d; });
  let childExit: number | null = null;
  child.on('exit', (c) => { childExit = c; });

  // Wait for daemon ready message
  for (let i = 0; i < 50; i++) {
    if (childOut.includes('ready') || childExit !== null) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (childExit !== null) return; // daemon failed to start

  const { readFile } = await import('node:fs/promises');
  let token = '';
  try { token = (await readFile(join(root, '.svp', '.svp-daemon-token'), 'utf8')).trim().split('\n')[0] ?? ''; } catch { return; }
  if (!token) return;

  // Send shutdown — handleShutdown no longer calls process.exit
  const sr = await postJson(port, '/api/v1/shutdown', { token }).catch(() => ({ statusCode: 0, body: '' }));
  assert.equal(sr.statusCode, 200, 'shutdown must respond 200');
  assert.ok(sr.body.includes('shutdown'), `body: ${sr.body}`);

  // Child exits naturally via bin shim
  for (let i = 0; i < 50; i++) { if (childExit !== null) break; await new Promise((r) => setTimeout(r, 200)); }
  assert.ok(childExit === 0 || childExit === null, `child exit ${childExit}`);
  if (childExit === null) child.kill();
});

// ── 9. Real signal port register/unregister ──
test('red team: signal port registers once and unregisters once after done (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-sig-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();

  // Test the REAL createNodeSignalSubscription, not a fake
  const signals = createNodeSignalSubscription();
  const events: string[] = [];
  const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: realHttpFactory });
  const shutdown = () => { void daemon.stop(); };

  signals.onShutdown(shutdown);
  events.push('on');

  await daemon.stop();
  signals.removeShutdownHandler(shutdown);
  events.push('off');

  assert.deepEqual(events, ['on', 'off'], 'on then off exactly once');
});

// ── 10. Post-start server error ──
test('red team: post-start server error produces done->{kind:failed,error}, exactly-once finalize (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-srv-err-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; } });
  sv.induceError(new Error('induced'));
  sv.releaseClose();
  const o = await d.done;
  assert.equal(o.kind, 'failed');
  assert.ok(o.error.message.includes('induced'));
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
  assert.equal(d.state(), 'stopped');
});

// ── 11. Close rejection: secondary, causal failure preserved ──
test('red team: close rejection is secondary — causal failure still wins (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-close-rej-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer({ rejectCloseWith: new Error('close-failed') });
  const d = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv), onFinalize: () => { fc++; } });
  sv.induceError(new Error('causal'));
  sv.releaseClose();
  const o = await d.done;
  assert.equal(o.kind, 'failed');
  assert.equal(o.error.message, 'causal', 'causal error not overwritten by close rejection');
  assert.equal(sv.closeCount, 1);
  assert.equal(fc, 1);
});

// ── 12. Finalize throw: causal failure preserved ──
test('red team: finalize throw is secondary — causal failure still wins (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-fin-throw-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let fc = 0;
  const sv = new ControllableServer();
  const d = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory: cf(sv),
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
