import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { forwardToDaemonSync, forwardTimeoutForArgs } from './client.js';
import { DAEMON_REQUEST_TIMEOUT_MS_DEFAULT, DAEMON_REQUEST_TIMEOUT_MS_LONG_RUNNING } from './daemon.constants.js';

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

test('forwardTimeoutForArgs gives dispatch start a long timeout (it waits for a real agent turn)', () => {
  assert.equal(forwardTimeoutForArgs(['dispatch', 'start', '--run', 'RUN-1']), DAEMON_REQUEST_TIMEOUT_MS_LONG_RUNNING);
});

test('forwardTimeoutForArgs uses the default timeout for other dispatch subcommands and other commands', () => {
  assert.equal(forwardTimeoutForArgs(['dispatch', 'prepare', '--role', 'implementer']), DAEMON_REQUEST_TIMEOUT_MS_DEFAULT);
  assert.equal(forwardTimeoutForArgs(['status']), DAEMON_REQUEST_TIMEOUT_MS_DEFAULT);
  assert.equal(forwardTimeoutForArgs([]), DAEMON_REQUEST_TIMEOUT_MS_DEFAULT);
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
    const status = forwardToDaemonSync(['status'], 'fake-token', server.port, undefined, 200);
    assert.equal(status, 1);
    assert.ok(written.some((line) => /timed out/i.test(line)), `expected a timeout message on stderr, got: ${JSON.stringify(written)}`);
  } finally {
    process.stderr.write = realWrite;
    await server.close();
  }
});
