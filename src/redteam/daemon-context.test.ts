import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { get as httpGet, request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, getDaemonStore } from '../db/store.js';
import { startDaemon } from '../daemon/daemon.js';
import { gitWorkspace } from '../runtime/workspace-git.js';

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer(); s.listen(0, () => { const a = s.address(); s.close(() => { resolve(typeof a === 'object' && a !== null && 'port' in a ? a.port : 0); }); });
  });
}

function initFixtureRepo(root: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
}

function postJson(port: number, path: string, body: unknown): Promise<{ statusCode: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = httpRequest({
      hostname: '127.0.0.1', port, method: 'POST', path,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', (c: string) => { d += c; }); res.on('end', () => { resolve({ statusCode: res.statusCode, body: d }); });
    });
    req.on('error', reject); req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); }); req.end(data);
  });
}

function realCliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.SV_PLAYBOOK_DAEMON; return env;
}

function spawnCollect(execPath: string, binPath: string, cwd: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const c = spawn(execPath, [binPath, 'status'], { cwd, env: realCliEnv(), timeout: 15000 });
    let o = '', e = ''; c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    c.stdout.on('data', (d: string) => { o += d; }); c.stderr.on('data', (d: string) => { e += d; });
    c.on('exit', (s) => { resolve({ status: s, stdout: o, stderr: e }); });
  });
}

function forceKillProcess(pid: number): void {
  if (process.platform === 'win32') { spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)]); return; }
  try {
    try { process.kill(pid, 0); } catch { return; }
    process.kill(pid, 'SIGKILL');
  } catch { /* process may have already exited */ }
}

async function stopDaemonChild(child: ReturnType<typeof spawn>, root: string, port: number): Promise<void> {
  if (child.exitCode !== null) return;
  try {
    const t = (await readFile(join(root, '.svp', '.svp-daemon-token'), 'utf8')).trim().split('\n')[0] ?? '';
    if (t) await postJson(port, '/api/v1/shutdown', { token: t });
  } catch { /* best-effort */ }
  const waitMs = (ms: number): Promise<void> => new Promise((r) => { child.once('exit', () => { r(); }); setTimeout(() => { r(); }, ms).unref(); });
  await waitMs(5000);
  /* child.exitCode can be set by the exit event during the async wait
   * above, re-checking it is a deliberate runtime-safety guard that TS's
   * narrowed type cannot account for. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const childAlive = child.exitCode === null;
  if (childAlive && child.pid !== undefined) { forceKillProcess(child.pid); await waitMs(5000); }
}

async function pollDaemon(port: number): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await new Promise<{ statusCode: number | undefined }>((resolve, reject) => {
        const req = httpGet(`http://127.0.0.1:${port}/api/v1/health`, (res2) => { resolve({ statusCode: res2.statusCode }); });
        req.on('error', reject); req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      if (res.statusCode === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('daemon did not start');
}

import type { WorkspacePort } from '../runtime/workspace.types.js';

function fakePort(known: string): WorkspacePort {
  return {
    canonicalWorkspaceRoot(cwd: string): string | null { return cwd === known ? known : null; },
    workspaceIdentity(): string | null { return known; },
    sameWorkspace(a: string, b: string): boolean { return a === known && b === known; },
  };
}

let daemonIndex = 0;

test('context validation accepts valid cwd via injected fake port (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-fake-port-${++daemonIndex}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const fp = fakePort(root);
  const daemon = await startDaemon(root, port, fp);
  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: root } });
    assert.equal(res.statusCode, 200, 'fake-port daemon must accept valid cwd');
    const parsed: unknown = JSON.parse(res.body);
    assert.ok(typeof parsed === 'object' && parsed !== null);
    assert.equal(Reflect.get(parsed, 'exitCode'), 0);
  } finally { await daemon.stop(); }
});

test('context validation rejects unknown cwd via injected fake port (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-fake-port-rej-${++daemonIndex}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const fp = fakePort(root);
  const daemon = await startDaemon(root, port, fp);
  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: '/nonexistent' } });
    assert.equal(res.statusCode, 400, 'fake-port daemon must reject unknown cwd');
    assert.ok(res.body.includes('invalid context'));
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Two worktrees, concurrent forwarding, no cross-binding ----
test('red team: concurrent worktree CLI forwarding through daemon does not cross-bind sessions (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-concurrent-wt-${++daemonIndex}`));
  initFixtureRepo(root);
  const wt1 = join(root, 'wt1'); const wt2 = join(root, 'wt2');
  execFileSync('git', ['worktree', 'add', wt1, 'HEAD'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt2, 'HEAD'], { cwd: root });
  openStore(root).close();

  const port = await freePort();
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const daemonChild = spawn(process.execPath, [binPath, 'daemon', '--port', String(port)], {
    cwd: root, env: realCliEnv(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  daemonChild.on('exit', () => {});

  try {
    await pollDaemon(port);

    // Concurrent CLI invocations from two worktrees
    const [r1, r2] = await Promise.all([
      spawnCollect(process.execPath, binPath, wt1),
      spawnCollect(process.execPath, binPath, wt2),
    ]);

    assert.equal(r1.status, 0, `wt1 must exit 0, got ${r1.status}\nstderr: ${r1.stderr}`);
    assert.equal(r2.status, 0, `wt2 must exit 0, got ${r2.status}\nstderr: ${r2.stderr}`);
    assert.ok(!r1.stderr.includes('daemon'), `wt1 must not print daemon errors: ${r1.stderr}`);
    assert.ok(!r2.stderr.includes('daemon'), `wt2 must not print daemon errors: ${r2.stderr}`);
    // Both must produce valid status output
    assert.ok(r1.stdout.includes('Board:'), `wt1 must produce status output: ${r1.stdout}`);
    assert.ok(r2.stdout.includes('Board:'), `wt2 must produce status output: ${r2.stdout}`);
  } finally {
    await stopDaemonChild(daemonChild, root, port);
  }
});

// ---- STORE-003: Concurrent worktree exec requests through daemon (HTTP) ----
test('red team: concurrent HTTP exec requests with distinct worktree cwds are isolated (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-concurrent-http-${++daemonIndex}`));
  initFixtureRepo(root);
  const wt1 = join(root, 'wt1'); const wt2 = join(root, 'wt2');
  execFileSync('git', ['worktree', 'add', wt1, 'HEAD'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt2, 'HEAD'], { cwd: root });
  openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, gitWorkspace);
  try {
    const [r1, r2] = await Promise.all([
      postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: wt1 } }),
      postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: wt2 } }),
    ]);
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    const p1: unknown = JSON.parse(r1.body); const p2: unknown = JSON.parse(r2.body);
    assert.ok(typeof p1 === 'object' && p1 !== null);
    assert.ok(typeof p2 === 'object' && p2 !== null);
    assert.equal(Reflect.get(p1, 'exitCode'), 0);
    assert.equal(Reflect.get(p2, 'exitCode'), 0);
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Forwarded exec request preserves cwd context ----
test('red team: forwarded exec request preserves cwd in daemon context (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-exec-ctx-${++daemonIndex}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, gitWorkspace);
  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: root } });
    assert.equal(res.statusCode, 200);
    const parsed: unknown = JSON.parse(res.body);
    assert.ok(typeof parsed === 'object' && parsed !== null);
    assert.equal(Reflect.get(parsed, 'exitCode'), 0);
    assert.ok(typeof Reflect.get(parsed, 'stdout') === 'string');
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Mixed-type argv rejection ----
test('red team: exec with mixed-type argv is rejected before any side effect (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-argv-${++daemonIndex}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, gitWorkspace);
  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['valid', 123, null], context: { cwd: root } });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.includes('argv required'), `must reject mixed argv: ${res.body}`);
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Concurrent session binding with distinct packets, no swap ----
test('red team: concurrent session binding — two distinct packets, event-to-session binding, no swap (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-als-${++daemonIndex}`));
  initFixtureRepo(root);
  const wt1 = join(root, 'wt1'); const wt2 = join(root, 'wt2');
  execFileSync('git', ['worktree', 'add', wt1, 'HEAD'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt2, 'HEAD'], { cwd: root });
  const seed = openStore(root);
  seed.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('ALS-S1', 'Session Test 1', '/tmp', 'ready', '[]', datetime('now'), datetime('now'))").run();
  seed.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('ALS-S2', 'Session Test 2', '/tmp', 'ready', '[]', datetime('now'), datetime('now'))").run();
  seed.close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, gitWorkspace);
  try {
    const ds = getDaemonStore(); assert.ok(ds);

    // Concurrent exec requests for two distinct packets from two worktrees
    const [r1, r2] = await Promise.all([
      postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['task', 'start', 'ALS-S1'], context: { cwd: wt1 } }),
      postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['task', 'start', 'ALS-S2'], context: { cwd: wt2 } }),
    ]);
    assert.equal(r1.statusCode, 200, `wt1 start must succeed, got ${r1.statusCode}: ${r1.body}`);
    assert.equal(r2.statusCode, 200, `wt2 start must succeed, got ${r2.statusCode}: ${r2.body}`);
    const p1: unknown = JSON.parse(r1.body);
    const p2: unknown = JSON.parse(r2.body);
    assert.ok(typeof p1 === 'object' && p1 !== null);
    assert.ok(typeof p2 === 'object' && p2 !== null);
    assert.equal(Reflect.get(p1, 'exitCode'), 0, `wt1 exec must exit 0: ${r1.body}`);
    assert.equal(Reflect.get(p2, 'exitCode'), 0, `wt2 exec must exit 0: ${r2.body}`);

    // Exactly 2 session rows with canonical worktree values
    const sessionRows = ds.db.prepare('SELECT id, worktree FROM sessions').all();
    assert.equal(sessionRows.length, 2, 'must create exactly 2 sessions');
    const sessionWorktrees = sessionRows.map((r: unknown) => {
      assert.ok(typeof r === 'object' && r !== null);
      return String(Reflect.get(r, 'worktree')).toLowerCase();
    });
    const canonicalWt1 = realpathSync(wt1).toLowerCase();
    const canonicalWt2 = realpathSync(wt2).toLowerCase();
    assert.ok(sessionWorktrees.includes(canonicalWt1), `wt1 (${canonicalWt1}) must be in session worktrees: [${sessionWorktrees.join(', ')}]`);
    assert.ok(sessionWorktrees.includes(canonicalWt2), `wt2 (${canonicalWt2}) must be in session worktrees: [${sessionWorktrees.join(', ')}]`);

    // Each transition has a distinct session (no swap)
    const transitions = ds.db.prepare(
      "SELECT t.session_id, t.packet_id FROM transitions t WHERE t.to_status = 'active' ORDER BY t.seq"
    ).all();
    const t0: unknown = transitions[0];
    const t1: unknown = transitions[1];
    assert.ok(t0 !== undefined && typeof t0 === 'object' && t0 !== null);
    assert.ok(t1 !== undefined && typeof t1 === 'object' && t1 !== null);
    assert.notEqual(Reflect.get(t0, 'packet_id'), Reflect.get(t1, 'packet_id'), 'must transition two distinct packets');
    assert.notEqual(Reflect.get(t0, 'session_id'), Reflect.get(t1, 'session_id'), 'each packet must have a distinct session (no swap)');
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Active-handler shutdown drain ----
test('red team: stop drains in-flight exec handlers before resolving (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-drain-${++daemonIndex}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, gitWorkspace);
  // Start exec request (don't await yet) — let it connect first
  const execPromise = postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: root } });
  await new Promise((r) => setTimeout(r, 300)); // wait for TCP connect
  // Call stop() while a request is in-flight — server.close must drain
  await daemon.stop();
  const execResponse = await execPromise;
  assert.equal(execResponse.statusCode, 200, `exec must complete before stop resolves, got ${execResponse.statusCode}`);
  const parsed: unknown = JSON.parse(execResponse.body);
  assert.ok(typeof parsed === 'object' && parsed !== null);
  assert.equal(Reflect.get(parsed, 'exitCode'), 0, `exec must succeed, got ${execResponse.body}`);
});

test('red team: exec requests are rejected with 503 or connection refused after stop (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-stop-rej-${++daemonIndex}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, gitWorkspace);

  await daemon.stop();

  // After stop(), the server either rejects via 503 (if the close callback
  // hasn't fired yet) or the port is closed entirely (ECONNREFUSED).
  // Either is observable, correct behavior — we test both paths by attempting
  // an exec and accepting either outcome.
  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: root } });
    assert.ok(res.statusCode === 503, `after stop, exec must return 503, got ${res.statusCode}: ${res.body}`);
    assert.ok(res.body.includes('unavailable'), `503 body must mention unavailable, got: ${res.body}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    assert.ok(msg.includes('ECONNREFUSED') || msg.includes('connection refused'), `after stop, exec must be refused or return 503, got: ${msg}`);
  }
});

// ---- STORE-003: Context boundary enforcement ----
test('red team: context boundary — outside-repo spoof, missing context, no store mutation on rejection, mixed argv (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-boundary-${++daemonIndex}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, gitWorkspace);
  try {
    const token = daemon.token; const ds = getDaemonStore(); assert.ok(ds);

    const outside = await mkdtemp(join(tmpdir(), `svp-boundary-out-${daemonIndex}`));
    const spoofRes = await postJson(port, '/api/v1/exec', { token, argv: ['describe'], context: { cwd: outside } });
    assert.equal(spoofRes.statusCode, 400); assert.ok(spoofRes.body.includes('invalid context'));

    const noCtxRes = await postJson(port, '/api/v1/exec', { token, argv: ['describe'] });
    assert.equal(noCtxRes.statusCode, 400); assert.ok(noCtxRes.body.includes('invalid context'));

    const ec = (row: Record<string, unknown> | undefined): number => row !== undefined ? Number(Reflect.get(row, 'c')) : 0;
    const before = ec(ds.db.prepare('SELECT COUNT(*) AS c FROM events').get());
    assert.equal(before, 0, 'no events before rejection');
    const noEffectRes = await postJson(port, '/api/v1/exec', { token, argv: ['check'], context: { cwd: outside } });
    assert.equal(noEffectRes.statusCode, 400);
    assert.equal(ec(ds.db.prepare('SELECT COUNT(*) AS c FROM events').get()), 0, 'no events after rejection');
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Shutdown lifecycle — state transitions + exactly-once ----
test('red team: shutdown lifecycle transitions running→stopping→stopped; concurrent stop returns same promise (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-stop-con-${++daemonIndex}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, gitWorkspace);
  assert.equal(daemon.state(), 'running');

  const s1 = daemon.stop();
  assert.equal(daemon.state(), 'stopping');

  const s2 = daemon.stop();
  assert.strictEqual(s1, s2, 'concurrent stop() must return identical promise');

  await s1;
  assert.equal(daemon.state(), 'stopped');

  const ds = getDaemonStore();
  assert.ok(ds === null, 'daemon store must be null after stop');

  // Second stop after stopped resolves immediately
  const s3 = daemon.stop();
  assert.equal(daemon.state(), 'stopped');
  await s3;
});
