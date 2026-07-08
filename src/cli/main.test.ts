import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { main } from './main.js';
import type { Io } from './command.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

test('unknown command prints usage and exits 2', async () => {
  const io = fakeIo();
  const code = await main(['definitely-not-a-command'], io);
  assert.equal(code, 2);
  assert.ok(io.errLines.join('\n').includes('Unknown command'));
  assert.ok(io.errLines.join('\n').includes('Usage: sv-playbook <command>'));
});

test('no args prints usage and exits 2', async () => {
  const io = fakeIo();
  const code = await main([], io);
  assert.equal(code, 2);
  assert.ok(io.errLines.join('\n').includes('Usage: sv-playbook <command>'));
});

test('bin shim filters experimental warnings only', () => {
  const result = spawnSync(process.execPath, ['bin/sv-playbook.js', 'docs'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ok(!result.stderr.includes('ExperimentalWarning'), `stderr had ExperimentalWarning:\n${result.stderr}`);
});
