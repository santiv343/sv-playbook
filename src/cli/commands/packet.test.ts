import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command as packetCommand } from './packet.js';
import { command as taskCommand } from './task.js';
import type { Io } from '../command.types.js';
import { initTestRepo } from '../../testkit.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-packet-'));
  initTestRepo(root);
  const prev = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

test('packet command declares a non-empty usage string', () => {
  assert.notEqual(packetCommand.usage.trim(), '');
  assert.match(packetCommand.usage, /^Usage: sv-playbook packet/);
});

test('packet history lists versions oldest to newest with digests', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Body.\n', 'utf8');
    const taskIo = fakeIo();
    await taskCommand.run(['create', '--id', 'PKT-HIST-001', '--title', 'History Packet', '--write', 'src/**', '--body-file', 'body.md'], taskIo);
    await taskCommand.run(['amend', 'PKT-HIST-001', '--title', 'History Packet Amended'], taskIo);

    const io = fakeIo();
    assert.equal(await packetCommand.run(['history', 'PKT-HIST-001'], io), 0);
    const output = io.outLines.join('\n');
    assert.match(output, /v1\t.+\t[0-9a-f]{8}/);
    assert.match(output, /v2\t.+\t[0-9a-f]{8}/);
  });
});

test('packet diff shows the field that changed between two versions', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Body.\n', 'utf8');
    const taskIo = fakeIo();
    await taskCommand.run(['create', '--id', 'PKT-DIFF-001', '--title', 'Diff Packet', '--write', 'src/**', '--body-file', 'body.md'], taskIo);
    await taskCommand.run(['amend', 'PKT-DIFF-001', '--title', 'Diff Packet Amended'], taskIo);

    const io = fakeIo();
    assert.equal(await packetCommand.run(['diff', 'PKT-DIFF-001', '--from', '1', '--to', '2'], io), 0);
    const output = io.outLines.join('\n');
    assert.match(output, /title:/);
  });
});
