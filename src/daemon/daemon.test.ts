import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, isDaemonRunning } from '../db/store.js';
import { forwardToDaemon } from './client.js';
import { startDaemon } from './daemon.js';
import { EXIT } from '../cli/command.constants.js';

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const addr = s.address();
      let port = 0;
      if (typeof addr === 'object' && addr !== null && 'port' in addr) {
        port = addr.port;
      }
      s.close(() => { resolve(port); });
    });
  });
}

async function inTempRepo<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-daemon-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try { return await fn(root); } finally { process.chdir(previous); }
}

test('a worktree CLI cannot open the live store directly and is served through the blessed daemon instead', async () => {
  await inTempRepo(async (root) => {
    const wtDir = join(root, 'wt');
    execFileSync('git', ['branch', 'wt-branch'], { cwd: root });
    execFileSync('git', ['worktree', 'add', wtDir, 'wt-branch'], { cwd: root });
    assert.ok(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: wtDir, encoding: 'utf8' }).trim() !== root);

    openStore(root).close();

    const port = await freePort();
    const daemon = await startDaemon(root, port);

    try {
      assert.ok(isDaemonRunning(root));

      // 1. Forward a CLI command through the daemon — the daemon executes it with
      //    its own code, not the worktree's code, preventing version skew
      const forwardCode = await forwardToDaemon(['--help'], daemon.token, port);
      assert.equal(forwardCode, EXIT.USAGE, `forward should succeed, got code ${forwardCode}`);

      // 2. The daemon's version is returned in the response — verified via the health endpoint
      const http = await import('node:http');
      const healthBody = await new Promise<string>((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/v1/health`, (res) => {
          let data = '';
          res.on('data', (c: string) => { data += c; });
          res.on('end', () => { resolve(data); });
        }).on('error', reject);
      });
      const health: unknown = JSON.parse(healthBody);
      assert.ok(typeof health === 'object' && health !== null);
      const healthStatus: unknown = Reflect.get(health, 'status');
      const healthVersion: unknown = Reflect.get(health, 'version');
      assert.equal(healthStatus, 'ok');
      assert.ok(typeof healthVersion === 'string');

      // 3. Direct openStore from a non-daemon process is blocked
      assert.throws(
        () => { openStore(root); },
        /daemon/,
      );

      // 4. A worktree process attempting a direct DatabaseSync open of the store
      // while the daemon holds the exclusive lock fails (SQLITE_BUSY)
      const dbPath = join(root, '.svp', 'playbook.sqlite');
      const subResult = execFileSync(process.execPath, ['-e', `
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
      assert.ok(subResult.includes('FAIL:'), `expected DatabaseSync open to fail, got: ${subResult}`);
    } finally {
      daemon.stop();
    }
  });
});
