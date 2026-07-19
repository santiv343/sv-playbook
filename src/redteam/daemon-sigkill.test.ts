import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, isDaemonRunning } from '../db/store.js';
import { SVP_DIR } from '../db/store.constants.js';
import { startDaemon } from '../daemon/daemon.js';
import { OS_PLATFORM } from '../platform.constants.js';
import { initTestRepo } from '../testkit.js';
import { get as httpGet } from 'node:http';
import { createServer as createNetServer } from 'node:net';

function realCliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.SV_PLAYBOOK_DAEMON;
  return env;
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer().listen(0, () => {
      const addr = s.address();
      resolve(typeof addr === 'object' && addr !== null && 'port' in addr ? addr.port : 0);
      s.close();
    });
  });
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
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

function initFixtureRepo(root: string): void {
  initTestRepo(root);
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
}

test('red team: SIGKILL crash is detected via nonce mismatch and system recovers with a fresh daemon (STORE-003 hardening)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-sigkill-'));
  initFixtureRepo(root);
  openStore(root).close();
  const port = await freePort();
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const daemonChild = spawn(process.execPath, [binPath, 'daemon', '--port', String(port)], {
    cwd: root, env: realCliEnv(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let daemonExited = false;
  daemonChild.on('exit', () => { daemonExited = true; });
  try {
    assert.ok(await pollHealth(port, 15000) !== null, 'daemon must start');
    const svpDir = join(root, SVP_DIR);
    const lockPath = join(svpDir, '.svp-daemon.lock');
    const tokenPath = join(svpDir, '.svp-daemon-token');
    const origLock = await readFile(lockPath, 'utf8');
    const origToken = (await readFile(tokenPath, 'utf8')).trim().split('\n')[0] ?? '';
    assert.ok(origToken.length > 0, 'original token must exist');

    const daemonPid = daemonChild.pid;
    assert.ok(daemonPid !== undefined, 'daemon PID must be known');
    if (process.platform === OS_PLATFORM.WINDOWS) {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(daemonPid)]);
    } else { daemonChild.kill('SIGKILL'); }
    await new Promise<void>((resolve) => {
      if (daemonExited) { resolve(); return; }
      daemonChild.once('exit', () => { resolve(); });
      setTimeout(() => { resolve(); }, 3000).unref();
    });
    assert.ok(daemonExited, 'daemon must have exited after SIGKILL');
    daemonExited = false;
    assert.ok(existsSync(lockPath), 'lock file must survive SIGKILL');
    assert.ok(existsSync(tokenPath), 'token file must survive SIGKILL');

    const lockLines = origLock.trim().split('\n');
    const portFromLock = lockLines[1];
    const timestampFromLock = lockLines[2];
    await writeFile(lockPath, `${process.pid}\n${portFromLock}\n${timestampFromLock}\nWRONG-NONCE-FROM-DEAD-DAEMON\n`);
    assert.ok(!isDaemonRunning(root), 'isDaemonRunning must return false on nonce mismatch with live PID');
    assert.ok(!existsSync(lockPath), 'stale lock file must be cleaned up');

    const recoveryPort = await freePort();
    await writeFile(lockPath, `${process.pid}\n${portFromLock}\n${timestampFromLock}\nWRONG-NONCE\n`);
    const freshDaemon = await startDaemon(root, recoveryPort);
    try {
      assert.ok(isDaemonRunning(root), 'fresh daemon must be detected as running');
      assert.ok(await healthOnce(recoveryPort) !== null, 'fresh daemon must answer health');
    } finally { await freshDaemon.stop(); }
  } finally {
    if (daemonChild.exitCode === null && daemonChild.pid !== undefined) {
      if (process.platform === OS_PLATFORM.WINDOWS) {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(daemonChild.pid)]);
      } else { daemonChild.kill('SIGKILL'); }
    }
  }
});
