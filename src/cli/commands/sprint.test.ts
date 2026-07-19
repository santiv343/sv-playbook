import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { command as taskCommand } from './task.js';
import { command as sprintCommand } from './sprint.js';
import type { Io } from '../command.types.js';
import { initTestRepo } from '../../testkit.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = []; const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-cli-sprint-'));
  initTestRepo(root);
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  const prev = process.cwd();
  process.chdir(root);
  try { return await fn(); } finally { process.chdir(prev); }
}

async function createTaskFile(name: string, content: string): Promise<void> {
  await mkdir('tmp', { recursive: true });
  await writeFile(name, content);
}

test('sprint create -> add -> show -> list -> close happy path', async () => {
  await inTempRepo(async () => {
    await createTaskFile('body1.md', 'Task 1');

    const io = fakeIo();
    assert.equal(await taskCommand.run(['create', '--id', 'FEAT-101', '--title', 'X1', '--write', 'src/a/**', '--body-file', 'body1.md'], io), 0);
    assert.equal(await taskCommand.run(['create', '--id', 'FEAT-102', '--title', 'X2', '--write', 'src/b/**', '--body-file', 'body1.md'], io), 0);

    assert.equal(await sprintCommand.run(['create', '--goal', 'Ship it', '--budget', '500'], io), 0);
    const out = io.outLines.join('\n');
    const match = /created (S-\d+)/.exec(out);
    assert.ok(match !== null);
    const sprintId = match[1];
    if (sprintId === undefined) throw new Error('no sprint id');

    assert.equal(await sprintCommand.run(['add', sprintId, 'FEAT-101'], io), 0);
    assert.equal(await sprintCommand.run(['add', sprintId, 'FEAT-102'], io), 0);

    const io2 = fakeIo();
    assert.equal(await sprintCommand.run(['show', sprintId], io2), 0);
    const show = io2.outLines.join('\n');
    assert.ok(show.includes('FEAT-101'));
    assert.ok(show.includes('FEAT-102'));
    assert.ok(show.includes('Ship it'));

    const io3 = fakeIo();
    assert.equal(await sprintCommand.run(['list'], io3), 0);
    assert.ok(io3.outLines.some((l) => l.includes(sprintId)));

    const io4 = fakeIo();
    assert.equal(await sprintCommand.run(['backlog'], io4), 0);
    assert.ok(io4.outLines.join('\n').includes('backlog empty') || io4.outLines.join('\n').includes('FEAT-'));

    assert.equal(await sprintCommand.run(['order', sprintId, 'FEAT-102', 'FEAT-101'], io), 0);

    assert.equal(await taskCommand.run(['move', 'FEAT-101', 'dropped'], io), 0);
    assert.equal(await taskCommand.run(['move', 'FEAT-102', 'dropped'], io), 0);

    assert.equal(await sprintCommand.run(['close', sprintId], io), 0);
    assert.ok(io.outLines.some((l) => l.includes('closed')));
  });
});

test('sprint close refuses non-terminal tasks', async () => {
  await inTempRepo(async () => {
    await createTaskFile('body1.md', 'Task 1');
    const io = fakeIo();

    assert.equal(await taskCommand.run(['create', '--id', 'FEAT-201', '--title', 'X', '--write', 'src/c/**', '--body-file', 'body1.md'], io), 0);
    assert.equal(await sprintCommand.run(['create', '--goal', 'Sprint A', '--budget', '100'], io), 0);
    const match2 = /created (S-\d+)/.exec(io.outLines.join('\n'));
    assert.ok(match2 !== null);
    const sprintId2 = match2[1];
    if (sprintId2 === undefined) throw new Error('no sprint id');
    assert.equal(await sprintCommand.run(['add', sprintId2, 'FEAT-201'], io), 0);

    assert.equal(await sprintCommand.run(['close', sprintId2], io), 1);
    assert.ok(io.errLines.some((l) => l.includes('non-terminal')));
  });
});

test('sprint unknown subcommand exits 2 with usage', async () => {
  const io = fakeIo();
  assert.equal(await sprintCommand.run(['frobnicate'], io), 2);
  assert.ok(io.errLines.some((l) => l.includes('Usage')));
});

test('sprint command declares a non-empty usage string', () => {
  assert.notEqual(sprintCommand.usage.trim(), '');
  assert.match(sprintCommand.usage, /^Usage:\n\s+sv-playbook sprint/);
});
