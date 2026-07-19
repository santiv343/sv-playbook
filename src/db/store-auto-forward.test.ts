import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DAEMON_ROUTE } from '../daemon/daemon.constants.js';
import { initTestRepo } from '../testkit.js';

test('tryAutoForward refuses to forward when the daemon build digest differs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-stale-daemon-'));
  initTestRepo(root);
  await mkdir(join(root, '.svp'), { recursive: true });

  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    if (req.url === DAEMON_ROUTE.HEALTH) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', buildDigest: 'stale-digest' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr !== null && 'port' in addr ? addr.port : 0);
    });
  });

  await writeFile(join(root, '.svp', '.svp-daemon.lock'), `${process.pid}\n${port}\n${new Date().toISOString()}\n`);
  await writeFile(join(root, '.svp', '.svp-daemon-token'), 'test-token');

  const storeUrl = new URL('./store.js', import.meta.url).href;
  const script = `process.chdir(${JSON.stringify(root)});process.argv=['node','sv-playbook','status'];await import(${JSON.stringify(storeUrl)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: '' },
  });

  server.close();
  assert.notEqual(result.status, 0, `expected non-zero exit, got ${result.status}`);
  assert.ok(result.stderr.includes('older build'), `expected stale build guidance, got: ${result.stderr}`);
});
