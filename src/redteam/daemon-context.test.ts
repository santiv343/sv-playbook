import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, getDaemonStore } from '../db/store.js';
import { startDaemon } from '../daemon/daemon.js';

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const addr = s.address();
      let p = 0;
      if (typeof addr === 'object' && addr !== null && 'port' in addr) p = addr.port;
      s.close(() => { resolve(p); });
    });
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
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { d += c; });
      res.on('end', () => { resolve({ statusCode: res.statusCode, body: d }); });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end(data);
  });
}

function spawnCollect(execPath: string, binPath: string, cwd: string, env: NodeJS.ProcessEnv, timeout: number): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const c = spawn(execPath, [binPath, 'status'], { cwd, env, timeout });
    let o = '', e = ''; c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    c.stdout.on('data', (d: string) => { o += d; }); c.stderr.on('data', (d: string) => { e += d; });
    c.on('exit', (s) => { resolve({ status: s, stdout: o, stderr: e }); });
  });
}

async function stopDaemonChild(child: ReturnType<typeof spawn>, root: string, port: number): Promise<void> {
  if (child.exitCode !== null) return;
  try {
    const t = (await readFile(join(root, '.svp', '.svp-daemon-token'), 'utf8')).trim().split('\n')[0] ?? '';
    if (t) await postJson(port, '/api/v1/shutdown', { token: t });
  } catch { /* best-effort */ }
  const waitMs = (ms: number): Promise<void> => new Promise((r) => { child.once('exit', () => { r(); }); setTimeout(() => { r(); }, ms).unref(); });
  const alive = (): boolean => child.exitCode === null;
  if (alive()) await waitMs(5000);
  const pid = child.pid;
  if (pid !== undefined && alive()) {
    const cmd = process.platform === 'win32' ? () => spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)]) : () => child.kill('SIGKILL');
    cmd(); await waitMs(5000);
  }
}

function realCliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.SV_PLAYBOOK_DAEMON;
  return env;
}

let daemonIndex = 0;

// ---- STORE-003: Two worktrees, distinct sessions, no cross-binding ----
test('red team: concurrent worktree CLI invocations through daemon do not cross-bind sessions (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-concurrent-wt-${++daemonIndex}`));
  initFixtureRepo(root);

  const wt1 = join(root, 'wt1');
  const wt2 = join(root, 'wt2');
  execFileSync('git', ['branch', 'wt-branch-1'], { cwd: root });
  execFileSync('git', ['branch', 'wt-branch-2'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt1, 'wt-branch-1'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt2, 'wt-branch-2'], { cwd: root });

  const seed = openStore(root);
  seed.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('CONC-P1', 'Concurrent P1', '/tmp', 'draft', '[]', datetime('now'), datetime('now'))").run();
  seed.close();

  const port = await freePort();
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');

  const daemonChild = spawn(process.execPath, [binPath, 'daemon', '--port', String(port)], {
    cwd: root,
    env: realCliEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let daemonExited = false;
  daemonChild.on('exit', () => { daemonExited = true; });
  void daemonExited;

  try {
    // Fire two CLI invocations from different worktrees concurrently
    const [r1, r2] = await Promise.all([
      spawnCollect(process.execPath, binPath, wt1, realCliEnv(), 15000),
      spawnCollect(process.execPath, binPath, wt2, realCliEnv(), 15000),
    ]);

    assert.equal(r1.status, 0, `wt1 status must succeed, got ${r1.status}\nstderr: ${r1.stderr}`);
    assert.equal(r2.status, 0, `wt2 status must succeed, got ${r2.status}\nstderr: ${r2.stderr}`);
    assert.ok(!r1.stderr.includes('daemon'), `wt1 must not print daemon errors: ${r1.stderr}`);
    assert.ok(!r2.stderr.includes('daemon'), `wt2 must not print daemon errors: ${r2.stderr}`);
  } finally {
    await stopDaemonChild(daemonChild, root, port);
  }
});

// ---- STORE-003: Forwarded exec request preserves cwd context ----
test('red team: forwarded exec request preserves cwd in daemon context (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-exec-ctx-${++daemonIndex}`));
  initFixtureRepo(root);
  openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port);
  try {
    const token = daemon.token;
    const res = await postJson(port, '/api/v1/exec', { token, argv: ['describe'], context: { cwd: root } });
    assert.equal(res.statusCode, 200);
    const parsed: unknown = JSON.parse(res.body);
    assert.ok(typeof parsed === 'object' && parsed !== null);
    assert.equal(Reflect.get(parsed, 'exitCode'), 0);
    assert.ok(typeof Reflect.get(parsed, 'stdout') === 'string');
  } finally { daemon.stop(); }
});

// ---- STORE-003: Two concurrent exec requests with different contexts ----
test('red team: concurrent exec requests with distinct contexts are isolated (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-concurrent-exec-${++daemonIndex}`));
  initFixtureRepo(root);
  openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port);
  try {
    const token = daemon.token;
    const [r1, r2] = await Promise.all([
      postJson(port, '/api/v1/exec', { token, argv: ['describe'], context: { cwd: root } }),
      postJson(port, '/api/v1/exec', { token, argv: ['describe'], context: { cwd: root } }),
    ]);
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    const p1: unknown = JSON.parse(r1.body);
    const p2: unknown = JSON.parse(r2.body);
    assert.ok(typeof p1 === 'object' && p1 !== null);
    assert.ok(typeof p2 === 'object' && p2 !== null);
    assert.equal(Reflect.get(p1, 'exitCode'), 0);
    assert.equal(Reflect.get(p2, 'exitCode'), 0);
    assert.equal(Reflect.get(p1, 'daemonVersion'), '0.1.0');
    assert.equal(Reflect.get(p2, 'daemonVersion'), '0.1.0');
  } finally { daemon.stop(); }
});

// ---- STORE-003: Context boundary enforcement ----
test('red team: context boundary — outside-repo spoof, missing context, no store mutation on rejection (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-boundary-${++daemonIndex}`));
  initFixtureRepo(root);
  openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port);
  try {
    const token = daemon.token;
    const ds = getDaemonStore();
    assert.ok(ds);

    // 1. Outside-repo cwd spoof rejected
    const outside = await mkdtemp(join(tmpdir(), `svp-boundary-outside-${daemonIndex}`));
    const spoofRes = await postJson(port, '/api/v1/exec', { token, argv: ['describe'], context: { cwd: outside } });
    assert.equal(spoofRes.statusCode, 400);
    assert.ok(spoofRes.body.includes('invalid context'));

    // 2. Missing context rejected
    const noCtxRes = await postJson(port, '/api/v1/exec', { token, argv: ['describe'] });
    assert.equal(noCtxRes.statusCode, 400);
    assert.ok(noCtxRes.body.includes('invalid context'));

    // 3. No side-effect on store after rejection
    const ec = (row: Record<string, unknown> | undefined): number => row !== undefined ? Number(Reflect.get(row, 'c')) : 0;
    const before = ec(ds.db.prepare('SELECT COUNT(*) AS c FROM events').get());
    assert.equal(before, 0, 'no events before rejection');
    const noEffectRes = await postJson(port, '/api/v1/exec', { token, argv: ['check'], context: { cwd: outside } });
    assert.equal(noEffectRes.statusCode, 400);
    const after = ec(ds.db.prepare('SELECT COUNT(*) AS c FROM events').get());
    assert.equal(after, 0, 'no events after rejection');
  } finally { daemon.stop(); }
});
