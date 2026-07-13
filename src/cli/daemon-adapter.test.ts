import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCliCommandExecutionPort } from '../daemon/adapters/cli-execution-port.js';

const cliCommandPort = createCliCommandExecutionPort();

test('cliCommandPort preserves exit code and stdout from main (success case)', async () => {
  const r = await cliCommandPort.execute({ argv: ['describe'], cwd: process.cwd() });
  assert.equal(r.exitCode, 0, 'describe must exit 0');
  assert.ok(r.stdout.length > 0, 'stdout must contain output');
  assert.ok(r.stdout.includes('describe'), 'stdout must contain the command name');
  assert.equal(r.stderr, '', 'stderr must be empty for successful describe');
});

test('cliCommandPort preserves exit code and stderr from main (failing case)', async () => {
  const r = await cliCommandPort.execute({ argv: ['--unknown-flag-xyz'], cwd: process.cwd() });
  // --unknown-flag-xz is not a valid command, usage should be printed to stderr
  assert.equal(r.exitCode, 2, 'invalid flag must exit 2');
  assert.ok(r.stderr.length > 0, 'stderr must contain error message');
  assert.ok(r.stderr.includes('Usage'), 'stderr must contain usage text');
  // In the failing case, stdout could be empty or contain the usage as well
  // depending on how main() routes output — but stderr MUST have the error.
  assert.ok(r.stderr.includes('command'), 'stderr must reference command in usage');
});
