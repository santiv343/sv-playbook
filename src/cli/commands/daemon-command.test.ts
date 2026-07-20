import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { command, daemonStartErrorDetail } from './daemon.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';

function fakeIo(): Io & { errLines: string[] } {
  const errLines: string[] = [];
  return { errLines, out: () => undefined, err: (line) => void errLines.push(line) };
}

test('daemon startup failure reports a normalized actionable cause', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');

  try {
    const io = fakeIo();
    const code = await command.run(['--port', String(address.port)], io);

    assert.equal(code, EXIT.SYSTEM);
    assert.match(io.errLines.join('\n'), /^Failed to start daemon: daemon failed to listen .*EADDRINUSE:/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('daemon startup failure normalizes non-Error rejection values', () => {
  assert.equal(daemonStartErrorDetail({ reason: 'socket unavailable' }), '[object Object]');
});
