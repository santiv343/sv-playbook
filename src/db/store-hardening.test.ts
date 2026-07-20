import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDaemonRunning } from './store.js';

test('sync forward times out when daemon hangs after connect (STORE-003 hardening)', async () => {
  const port = await new Promise<number>((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const addr = s.address();
      let p = 0;
      if (typeof addr === 'object' && addr !== null && 'port' in addr) p = addr.port;
      s.close(() => { resolve(p); });
    });
  });
  const server = createNetServer((socket) => { socket.on('data', () => {}); });
  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => { resolve(); });
    server.on('error', reject);
  });
  try {
    const clientUrl = new URL('../daemon/client.js', import.meta.url).href;
    const script = `const { forwardToDaemonSync } = await import(${JSON.stringify(clientUrl)});process.exit(forwardToDaemonSync(['status'], 't', ${port}, undefined, 200));`;
    const code = await new Promise<number>((resolve) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'inherit', 'inherit'] });
      child.on('exit', (c) => { resolve(c ?? 1); });
    });
    assert.notEqual(code, 0, `forward must time out on hung daemon, got exit ${code}`);
  } finally { server.close(); }
});

test('isDaemonRunning validates nonce and falls back to PID-only for legacy locks (STORE-003 hardening)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-nonce-'));
  const svpDir = join(root, '.svp');
  await mkdir(svpDir, { recursive: true });
  const lockPath = join(svpDir, '.svp-daemon.lock');

  await writeFile(lockPath, `${process.pid}\n4141\n${new Date().toISOString()}\nnonce-from-dead-daemon\n`);
  await writeFile(join(svpDir, '.svp-daemon-token'), 'real-token\n');
  assert.ok(!isDaemonRunning(root), 'must return false when nonce mismatches token');
  assert.ok(!existsSync(lockPath), 'must clean up lock file on nonce mismatch');

  await mkdir(svpDir, { recursive: true });
  await writeFile(lockPath, `${process.pid}\n4141\n${new Date().toISOString()}\n`);
  assert.ok(isDaemonRunning(root), 'must return true for legacy lock with alive PID');

  await writeFile(lockPath, '999999999\n4141\n2025-01-01T00:00:00.000Z\n');
  assert.ok(!isDaemonRunning(root), 'must return false for legacy lock with dead PID');
  assert.ok(!existsSync(lockPath), 'must clean up legacy lock on dead PID');
});
