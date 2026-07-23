import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forwardToDaemonSync, forwardTimeoutForArgs } from './client.js';
import { DAEMON_REQUEST_TIMEOUT_MS_DEFAULT } from './daemon.constants.js';
import { DAEMON_DEFAULTS } from '../config.constants.js';

// Server que acepta la conexión pero nunca responde — fuerza el camino de
// timeout de forwardToDaemonSync sin depender de un daemon real lento.
async function unresponsiveServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer(() => { /* nunca llama a res.end() */ });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');
  return {
    port: address.port,
    close: () => new Promise((resolve) => { server.close(() => { resolve(); }); }),
  };
}

function emptyRepoRoot(): string {
  return mkdtempSync(join(tmpdir(), 'svp-client-'));
}

test('forwardTimeoutForArgs gives dispatch start the configured daemon.dispatchTimeoutMs', () => {
  assert.equal(forwardTimeoutForArgs(['dispatch', 'start', '--run', 'RUN-1'], emptyRepoRoot()), DAEMON_DEFAULTS.dispatchTimeoutMs);
});

test('forwardTimeoutForArgs honors a project override for dispatch start', () => {
  const dir = emptyRepoRoot();
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({ daemon: { dispatchTimeoutMs: 42_000 } }));
  assert.equal(forwardTimeoutForArgs(['dispatch', 'start', '--run', 'RUN-1'], dir), 42_000);
});

test('forwardTimeoutForArgs uses the default timeout for other dispatch subcommands and other commands', () => {
  const dir = emptyRepoRoot();
  assert.equal(forwardTimeoutForArgs(['dispatch', 'prepare', '--role', 'implementer'], dir), DAEMON_REQUEST_TIMEOUT_MS_DEFAULT);
  assert.equal(forwardTimeoutForArgs(['status'], dir), DAEMON_REQUEST_TIMEOUT_MS_DEFAULT);
  assert.equal(forwardTimeoutForArgs([], dir), DAEMON_REQUEST_TIMEOUT_MS_DEFAULT);
});

test('forwardToDaemonSync times out and prints a clear message instead of exiting silently', async () => {
  const server = await unresponsiveServer();
  const written: string[] = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  function fakeWrite(chunk: string | Uint8Array): boolean {
    written.push(chunk.toString());
    return true;
  }
  process.stderr.write = fakeWrite;
  try {
    const status = forwardToDaemonSync(['status'], 'fake-token', server.port, emptyRepoRoot(), undefined, 200);
    assert.equal(status, 1);
    assert.ok(written.some((line) => /timed out/i.test(line)), `expected a timeout message on stderr, got: ${JSON.stringify(written)}`);
  } finally {
    process.stderr.write = realWrite;
    await server.close();
  }
});
