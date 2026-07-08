import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { taskCommand } from './task.js';
import type { Io } from '../command.js';
import { stringColumn } from '../../db/rows.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = []; const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-cli-'));
  execFileSync('git', ['init'], { cwd: root });
  const prev = process.cwd();
  process.chdir(root);
  try { return await fn(); } finally { process.chdir(prev); }
}

test('create -> list -> start -> move review happy path', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const io = fakeIo();
    assert.equal(await taskCommand.run(['create', '--id', 'P2-101', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io), 0);
    assert.equal(await taskCommand.run(['move', 'P2-101', 'ready'], io), 0);
    assert.equal(await taskCommand.run(['start', 'P2-101'], io), 0);
    assert.equal(await taskCommand.run(['move', 'P2-101', 'review'], io), 0);
    const io2 = fakeIo();
    assert.equal(await taskCommand.run(['list', '--json'], io2), 0);
    const parsed: unknown = JSON.parse(io2.outLines.join('\n'));
    assert.ok(Array.isArray(parsed));
    assert.equal(stringColumn(parsed[0], 'status'), 'review');
  });
});

test('lifecycle errors exit 1 with message and hint', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'x');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'P2-102', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    const code = await taskCommand.run(['start', 'P2-102'], io);
    assert.equal(code, 1);
    assert.ok(io.errLines.some((l) => l.includes('wrong state draft')));
  });
});

test('unknown subcommand exits 2 with usage', async () => {
  const io = fakeIo();
  assert.equal(await taskCommand.run(['frobnicate'], io), 2);
  assert.ok(io.errLines.some((l) => l.includes('Usage')));
});
