import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, isDaemonRunning, getDaemonStore } from '../db/store.js';
import { startDaemon } from './daemon.js';
import { createCliCommandExecutionPort } from './adapters/cli-command-execution.js';
import { createNodeHttpServerFactory } from './adapters/node-http-server.js';
const cliCommandPort = createCliCommandExecutionPort();
const httpServerFactory = createNodeHttpServerFactory();
import { gitWorkspace } from '../runtime/workspace-git.js';
import { DAEMON_TOKEN_FILE } from './daemon.constants.js';
import { EXIT } from '../cli/command.constants.js';
import { SVP_DIR } from '../db/store.constants.js';
import { createStoreSessionBinding } from './adapters/local-store-session-binding.js';
const sessionBinding = createStoreSessionBinding();

// Run the shipped sync transport (client.js forwardToDaemonSync) from a child
// process — exactly how production auto-forwarding uses it (worktree CLI
// process → daemon process). It cannot be called in-process here: spawnSync
// would block the event loop the in-process daemon needs to answer.
const CLIENT_URL = new URL('./client.js', import.meta.url).href;
function runForwardToDaemonSyncInChild(argv: string[], token: string, port: number): Promise<number> {
  const script = `const { forwardToDaemonSync } = await import(${JSON.stringify(CLIENT_URL)});process.exit(forwardToDaemonSync(${JSON.stringify(argv)}, ${JSON.stringify(token)}, ${port}));`;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => { resolve(code ?? 1); });
  });
}

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
    const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory, sessionBinding });

    try {
      assert.ok(isDaemonRunning(root));

      // 1. Forward a CLI command through the daemon — the daemon executes it with
      //    its own code, not the worktree's code, preventing version skew.
      //    Uses the same transport production auto-forwarding ships with.
      const forwardCode = await runForwardToDaemonSyncInChild(['--help'], daemon.token, port);
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

      // 3. In-process openStore returns the daemonStore (not blocked)
      const inProcStore = openStore(root);
      assert.ok(inProcStore, 'in-process openStore must return daemonStore');
      inProcStore.close(); // no-op for daemonStore

      // 4. A separate child process cannot open the DB at all — the
      //    force-acquired exclusive lock prevents any other process from
      //    accessing the database.
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
      assert.ok(!subResult.includes('OK'), 'child process must be blocked by exclusive lock');
    } finally {
      await daemon.stop();
    }
  });
});

test('concurrent daemon starts: atomic lock file causes the second to refuse (STORE-003)', async () => {
  await inTempRepo(async (root) => {
    openStore(root).close();

    const port1 = await freePort();
    const daemon1 = await startDaemon(root, port1, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory, sessionBinding });

    try {
      assert.ok(isDaemonRunning(root));

      const port2 = await freePort();
      await assert.rejects(
        () => startDaemon(root, port2, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory, sessionBinding }),
        /already running/,
      );
    } finally {
      await daemon1.stop();
    }
  });
});

test('daemon auth token file is created owner-only (mode 0600)', { skip: process.platform === 'win32' }, async () => {
  await inTempRepo(async (root) => {
    openStore(root).close();

    const port = await freePort();
    const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory, sessionBinding });

    try {
      const tokenPath = join(root, SVP_DIR, DAEMON_TOKEN_FILE);
      const mode = statSync(tokenPath).mode & 0o777;
      assert.equal(mode, 0o600, `token file must be owner-only, got 0${mode.toString(8)}`);
    } finally {
      await daemon.stop();
    }
  });
});

test('daemon forwarded task note is persisted to the store (STORE-003)', async () => {
  await inTempRepo(async (root) => {
    // Create a packet for the note to attach to
    const store = openStore(root);
    const packetId = 'NOTE-FWD-001';
    store.db.prepare(`INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES (?, 'Fwd Note Test', '/tmp', 'draft', '[]', datetime('now'), datetime('now'))`).run(packetId);
    store.close();

    const port = await freePort();
    const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory, sessionBinding });

    try {
      assert.ok(isDaemonRunning(root));

      // Forward a task note command through the daemon's exec endpoint
      const code = await runForwardToDaemonSyncInChild(
        ['task', 'note', packetId, 'checkpoint reached'],
        daemon.token,
        port,
      );
      assert.equal(code, EXIT.OK, `task note forward must succeed, got exit ${code}`);

      // Verify the note event was written to the store via the in-process daemon store
      const ds = getDaemonStore();
      assert.ok(ds !== null, 'daemon store must be accessible in-process');
      const row = ds.db.prepare(
        "SELECT detail FROM events WHERE packet_id = ? AND command = 'note' ORDER BY seq DESC LIMIT 1",
      ).get(packetId);
      assert.ok(row !== undefined, 'note event must exist in the store');
    } finally {
      await daemon.stop();
    }
  });
});
