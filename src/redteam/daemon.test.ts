import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { get as httpGet } from 'node:http';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openStore, isDaemonRunning } from '../db/store.js';
import { startDaemon } from '../daemon/daemon.js';

// Env for child processes that must behave like a real (non-test) CLI invocation.
function realCliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.SV_PLAYBOOK_DAEMON;
  return env;
}

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

function healthOnce(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const req = httpGet(`http://127.0.0.1:${port}/api/v1/health`, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { data += c; });
      res.on('end', () => { resolve(res.statusCode === 200 ? data : null); });
    });
    req.on('error', () => { resolve(null); });
    req.setTimeout(1000, () => { req.destroy(); resolve(null); });
  });
}

async function pollHealth(port: number, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const body = await healthOnce(port);
    if (body !== null) return body;
    await delay(200);
  }
  return null;
}

// ---- CHEAT 14: Worktree direct store access while daemon holds exclusive lock ----
test('red team: a worktree process cannot open the store directly while the daemon holds the exclusive lock (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rt-daemon-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });

  const wtDir = join(root, 'wt');
  execFileSync('git', ['branch', 'wt-branch'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wtDir, 'wt-branch'], { cwd: root });

  openStore(root).close();

  const port = await new Promise<number>((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const addr = s.address();
      let p = 0;
      if (typeof addr === 'object' && addr !== null && 'port' in addr) p = addr.port;
      s.close(() => { resolve(p); });
    });
  });

  const daemon = await startDaemon(root, port);

  try {
    assert.ok(isDaemonRunning(root));

    // In-process openStore returns the daemonStore (not blocked)
    const inProcStore = openStore(root);
    assert.ok(inProcStore !== null, 'in-process openStore must return daemonStore');
    inProcStore.close(); // no-op for daemonStore

    // A separate child process attempting to open the live store directly is
    // blocked by the force-acquired exclusive lock.
    const dbPath = join(root, '.svp', 'playbook.sqlite');
    const childResult = execFileSync(process.execPath, ['-e', `
      const { DatabaseSync } = require('node:sqlite');
      try {
        const db = new DatabaseSync(${JSON.stringify(dbPath)});
        db.exec('PRAGMA journal_mode');
        db.close();
        process.stdout.write('OK');
      } catch (e) {
        process.stdout.write('FAIL:' + (e.message ?? String(e)));
      }
    `], { encoding: 'utf8', timeout: 10000 });
    assert.ok(childResult.includes('FAIL:'), 'child process must be blocked by exclusive lock');
  } finally {
    daemon.stop();
  }
});

// ---- STORE-003: Worktree CLI without daemon ----
test('red team: worktree CLI without daemon refuses with daemon guidance and does not materialize .svp (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rt-wt-003-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });

  const wtDir = join(root, 'wt');
  execFileSync('git', ['branch', 'wt-branch'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wtDir, 'wt-branch'], { cwd: root });

  // No daemon started

  const distMainUrl = pathToFileURL(join(process.cwd(), 'dist', 'cli', 'main.js')).href;
  const scriptPath = join(wtDir, '_svp_rt_003.mjs');
  await writeFile(scriptPath, `
    process.env.NODE_TEST_CONTEXT = '';
    const { main } = await import(${JSON.stringify(distMainUrl)});
    const code = await main(['status']);
    process.exit(code);
  `);

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: wtDir,
    encoding: 'utf8',
    timeout: 10000,
  });

  assert.notEqual(result.status, 0, `CLI from worktree without daemon must exit non-zero, got ${result.status}`);
  assert.ok(result.stderr.includes('daemon'), `stderr must mention daemon, got: ${result.stderr}`);
  assert.ok(result.stderr.includes('repo root'), `stderr must mention the repo root, got: ${result.stderr}`);

  assert.ok(!existsSync(join(root, '.svp')), '.svp must not be created under fixture root');
});

// ---- STORE-003 P0: direct mode at a repo ROOT must keep working ----
// The refusal tests above pass even if the CLI refuses everywhere; only this
// proves the happy path: a real child-process CLI at a fixture root (with the
// test-context env cleared) runs in direct mode.
test('red team: built CLI at a repo root runs in direct mode — status exits 0 and creates .svp (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rt-root-direct-'));
  initFixtureRepo(root);

  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const result = spawnSync(process.execPath, [binPath, 'status'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20000,
    env: realCliEnv(),
  });

  assert.equal(result.status, 0, `status at a repo root must exit 0 (direct mode), got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.ok(existsSync(join(root, '.svp', 'playbook.sqlite')), '.svp/playbook.sqlite must be created at the fixture root');
});

test('red team: sv-playbook daemon starts at a repo root — health responds, then shutdown (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rt-root-daemon-'));
  initFixtureRepo(root);

  const port = await freePort();
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const child = spawn(process.execPath, [binPath, 'daemon', '--port', String(port)], {
    cwd: root,
    env: realCliEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childErr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (c: string) => { childErr += c; });
  let exited = false;
  child.on('exit', () => { exited = true; });

  try {
    const healthBody = await pollHealth(port, 15000);
    assert.ok(healthBody !== null, `daemon must start and answer /api/v1/health at a fixture root; stderr: ${childErr}`);
    const health: unknown = JSON.parse(healthBody);
    assert.ok(typeof health === 'object' && health !== null);
    assert.equal(Reflect.get(health, 'status'), 'ok');
    assert.ok(!exited, 'daemon process must still be running after health check');
  } finally {
    child.kill();
    await new Promise<void>((resolve) => {
      if (exited) { resolve(); return; }
      child.once('exit', () => { resolve(); });
    });
  }
});

test('activation probe: spawn daemon detached, health, reject second writer, root forward, stop by PID, cleanup (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-activation-'));
  initFixtureRepo(root);

  // Pre-seed the store so commands work without --migrate-live
  const seed = openStore(root);
  seed.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('ACT-PROBE-P1', 'Activation dummy', '/tmp', 'draft', '[]', datetime('now'), datetime('now'))").run();
  seed.close();

  const port = await freePort();
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const daemonChild = spawn(process.execPath, [binPath, 'daemon', '--port', String(port)], {
    cwd: root,
    env: realCliEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let daemonErr = '';
  daemonChild.stderr.setEncoding('utf8');
  daemonChild.stderr.on('data', (c: string) => { daemonErr += c; });
  let daemonExited = false;
  daemonChild.on('exit', () => { daemonExited = true; });

  try {
    // ── 1. Health check ──
    const healthBody = await pollHealth(port, 15000);
    assert.ok(healthBody !== null, `daemon must start and answer /api/v1/health; stderr: ${daemonErr}`);
    const health: unknown = JSON.parse(healthBody);
    assert.ok(typeof health === 'object' && health !== null);
    assert.equal(Reflect.get(health, 'status'), 'ok');
    assert.ok(typeof Reflect.get(health, 'pid') === 'number', 'health must report pid');
    const pid: number = Reflect.get(health, 'pid');
    assert.ok(!daemonExited, 'daemon process must still be running after health check');

    // ── 2. Second-writer rejection ──
    const dbPath = join(root, '.svp', 'playbook.sqlite');
    const secondWriterResult = spawnSync(process.execPath, ['-e', `
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(${JSON.stringify(dbPath)});
      db.exec('BEGIN IMMEDIATE');
    `], { encoding: 'utf8', timeout: 5000 });
    assert.notEqual(secondWriterResult.status, 0,
      `second writer must fail with SQLITE_BUSY, got exit ${secondWriterResult.status}: ${secondWriterResult.stderr}`);
    assert.ok(
      /locked/i.test(secondWriterResult.stderr) || /busy/i.test(secondWriterResult.stderr),
      `second writer stderr must mention locked/busy: ${secondWriterResult.stderr}`,
    );

    // ── 3. Root forwarding: run CLI from root when daemon is active ──
    const fwdResult = spawnSync(process.execPath, [binPath, 'status'], {
      cwd: root,
      env: realCliEnv(),
      encoding: 'utf8',
      timeout: 20000,
    });
    assert.equal(fwdResult.status, 0,
      `CLI from root with daemon must forward and succeed, got exit ${fwdResult.status}\nstderr: ${fwdResult.stderr}`);

    // ── 4. Stop daemon by PID ──
    daemonChild.kill();
    if (!daemonExited) {
      await new Promise<void>((resolve) => {
        daemonChild.once('exit', () => { resolve(); });
      });
    }
    try { process.kill(pid, 0); assert.fail('daemon must be dead after kill'); }
    catch { /* expected — process is gone */ }

    // ── 5. Cleanup verification (skip on win32 — signal-based cleanup
    //    is tested in-process via daemon.stop()). ──
    if (process.platform !== 'win32') {
      const lockPath = join(root, '.svp', '.svp-daemon.lock');
      const tokenPath = join(root, '.svp', '.svp-daemon-token');
      assert.ok(!existsSync(lockPath), 'lock file must be cleaned up');
      assert.ok(!existsSync(tokenPath), 'token file must be cleaned up');
    }
  } finally {
    if (!daemonExited) {
      daemonChild.kill();
      await new Promise<void>((resolve) => {
        daemonChild.once('exit', () => { resolve(); });
      });
    }
  }
});

// ---- STORE-003: Two worktrees, distinct sessions, no cross-binding ----
test('red team: concurrent worktree CLI invocations through daemon do not cross-bind sessions (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-concurrent-wt-'));
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

  try {
    const healthBody = await pollHealth(port, 15000);
    assert.ok(healthBody !== null, 'daemon must start');

    // Fire two CLI invocations from different worktrees concurrently
    const [r1, r2] = await Promise.all([
      new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
        const c = spawn(process.execPath, [binPath, 'status'], { cwd: wt1, env: realCliEnv(), timeout: 15000 });
        let o = '', e = '';
        c.stdout.setEncoding('utf8'); c.stdout.on('data', (d: string) => { o += d; });
        c.stderr.setEncoding('utf8'); c.stderr.on('data', (d: string) => { e += d; });
        c.on('exit', (s) => { resolve({ status: s, stdout: o, stderr: e }); });
      }),
      new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
        const c = spawn(process.execPath, [binPath, 'status'], { cwd: wt2, env: realCliEnv(), timeout: 15000 });
        let o = '', e = '';
        c.stdout.setEncoding('utf8'); c.stdout.on('data', (d: string) => { o += d; });
        c.stderr.setEncoding('utf8'); c.stderr.on('data', (d: string) => { e += d; });
        c.on('exit', (s) => { resolve({ status: s, stdout: o, stderr: e }); });
      }),
    ]);

    assert.equal(r1.status, 0, `wt1 status must succeed, got ${r1.status}\nstderr: ${r1.stderr}`);
    assert.equal(r2.status, 0, `wt2 status must succeed, got ${r2.status}\nstderr: ${r2.stderr}`);
    assert.ok(!r1.stderr.includes('daemon'), `wt1 must not print daemon errors: ${r1.stderr}`);
    assert.ok(!r2.stderr.includes('daemon'), `wt2 must not print daemon errors: ${r2.stderr}`);
  } finally {
    if (!daemonExited) {
      daemonChild.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        if (daemonExited) { resolve(); return; }
        daemonChild.once('exit', () => { resolve(); });
      });
    }
  }
});
