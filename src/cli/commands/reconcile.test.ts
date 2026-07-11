import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
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
  const root = await mkdtemp(join(tmpdir(), 'svp-reconcile-cli-'));
  execFileSync('git', ['init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try { return await fn(); } finally { process.chdir(previous); }
}

test('reconcile with backup disabled and no packets prints convergence', async () => {
  await inTempRepo(async () => {
    await writeFile('playbook.config.json', JSON.stringify({ productName: 'test', backup: { enabled: false } }));
    const io = fakeIo();
    assert.equal(await main(['reconcile'], io), EXIT.OK, io.errLines.join('\n'));
    assert.ok(io.outLines.join('\n').includes('No divergences found'));
  });
});

test('reconcile --json returns valid JSON with rows and events', async () => {
  await inTempRepo(async () => {
    await writeFile('playbook.config.json', JSON.stringify({ productName: 'test', backup: { enabled: false } }));
    const io = fakeIo();
    assert.equal(await main(['reconcile', '--json'], io), EXIT.OK, io.errLines.join('\n'));
    const text = io.outLines.join('\n');
    const parsed: unknown = JSON.parse(text);
    assert.ok(typeof parsed === 'object' && parsed !== null && 'rows' in parsed && 'events' in parsed);
  });
});

test('reconcile rejects positional arguments', async () => {
  const io = fakeIo();
  assert.equal(await main(['reconcile', 'extra'], io), EXIT.USAGE);
  assert.ok(io.errLines.join('\n').includes('Usage:'));
});
