import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXIT } from './command.constants.js';
import { daemonOutcomeToExitCode } from '../daemon/adapters/daemon-outcome.js';
import type { Io } from './command.types.js';


function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

test('daemonOutcomeToExitCode maps stopped to EXIT.OK with no stderr', () => {
  const io = fakeIo();
  const code = daemonOutcomeToExitCode({ kind: 'stopped' } as const, io);
  assert.equal(code, EXIT.OK, 'stopped must map to OK');
  assert.equal(io.errLines.length, 0, 'stopped must not write to stderr');
});

test('daemonOutcomeToExitCode maps failed to EXIT.SYSTEM with error message', () => {
  const io = fakeIo();
  const code = daemonOutcomeToExitCode({ kind: 'failed', error: new Error('test') } as const, io);
  assert.equal(code, EXIT.SYSTEM, 'failed must map to SYSTEM');
  assert.ok(io.errLines.some((l) => l.includes('unexpectedly')), `stderr must mention unexpected termination: ${io.errLines.join('|')}`);
});
