import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('bootstrap scripts bypass tryAutoForward and run directly when daemon is alive (BUG-001)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-bug001-'));
  initTestRepo(root);
  await mkdir(join(root, '.svp'), { recursive: true });

  const buildDigestPath = fileURLToPath(new URL('../../dist/build-digest.json', import.meta.url));
  const buildDigestFile: unknown = JSON.parse(readFileSync(buildDigestPath, 'utf8'));
  const buildDigest = typeof buildDigestFile === 'object' && buildDigestFile !== null && 'digest' in buildDigestFile
    ? String(Reflect.get(buildDigestFile, 'digest'))
    : '';

  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    if (req.url === DAEMON_ROUTE.HEALTH) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', buildDigest }));
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
  const script = [
    `process.chdir(${JSON.stringify(root)});`,
    `process.argv=['node','scripts/bootstrap-bug001-verify.mjs'];`,
    `await import(${JSON.stringify(storeUrl)});`,
    `console.log('BOOTSTRAP_PASS');`,
  ].join('');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: '' },
  });

  server.close();
  assert.equal(result.status, 0, `expected exit 0 from direct-run bootstrap, got ${result.status}: stdout=${result.stdout} stderr=${result.stderr}`);
  assert.ok(result.stdout.includes('BOOTSTRAP_PASS'), `expected BOOTSTRAP_PASS in stdout, got: ${result.stdout}`);
});
