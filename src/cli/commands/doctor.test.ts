import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { main } from '../main.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-doctor-'));
  execFileSync('git', ['init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

test('doctor reports core project health in a git repo', async () => {
  await inTempRepo(async () => {
    const io = fakeIo();
    const code = await main(['doctor'], io);
    const output = io.outLines.join('\n');
    assert.equal(code, EXIT.OK, io.errLines.join('\n'));
    for (const marker of ['node:', 'git:', 'store:', 'packets:', 'leases:', 'backup:']) {
      assert.ok(output.includes(marker), `missing ${marker}`);
    }
  });
});

test('doctor rejects arguments with usage', async () => {
  const io = fakeIo();
  const code = await main(['doctor', 'extra'], io);
  assert.equal(code, EXIT.USAGE);
  assert.ok(io.errLines.join('\n').includes('Usage: sv-playbook doctor'));
});

test('doctor --json prints machine-readable checks', async () => {
  await inTempRepo(async () => {
    const io = fakeIo();
    assert.equal(await main(['doctor', '--json'], io), EXIT.OK, io.errLines.join('\n'));
    const parsed: unknown = JSON.parse(io.outLines.join('\n'));
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.some((item) => typeof item === 'object' && item !== null && 'label' in item));
  });
});
