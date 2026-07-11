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

    // A worktree process attempting to open the live store directly is blocked
    // with a clear error message naming the daemon.
    assert.throws(
      () => { openStore(root); },
      /daemon/,
    );
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
