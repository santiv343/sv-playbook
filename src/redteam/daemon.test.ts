import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, isDaemonRunning } from '../db/store.js';
import { startDaemon } from '../daemon/daemon.js';

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
