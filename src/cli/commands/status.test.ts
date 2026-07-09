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
  return { outLines, errLines, out: (line) => void outLines.push(line), err: (line) => void errLines.push(line) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-status-'));
  execFileSync('git', ['init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

test('status prints board counts and packet rows', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const setupIo = fakeIo();
    await main(['task', 'create', '--id', 'ST-001', '--title', 'Status One', '--write', 'src/**', '--body-file', 'body.md'], setupIo);
    await main(['task', 'move', 'ST-001', 'ready'], setupIo);

    const io = fakeIo();
    assert.equal(await main(['status'], io), EXIT.OK, io.errLines.join('\n'));
    const output = io.outLines.join('\n');
    assert.ok(output.includes('1 ready'), 'counts header should include "1 ready"');
    assert.ok(output.includes('ST-001'), 'output should include ST-001');
    assert.ok(output.includes('ID'), 'output should have column header "ID"');
    assert.ok(output.includes('STATUS'), 'output should have column header "STATUS"');
  });
});

test('human status renders an aligned table with a counts header', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const setupIo = fakeIo();
    await main(['task', 'create', '--id', 'ST-003', '--title', 'Status Three', '--write', 'src/**', '--body-file', 'body.md'], setupIo);

    const io = fakeIo();
    assert.equal(await main(['status'], io), EXIT.OK, io.errLines.join('\n'));
    const output = io.outLines.join('\n');
    assert.ok(output.includes('done '), 'output should have inline counts header with "done "');
    assert.ok(output.includes('ID'), 'output should have "ID" column header');
    assert.ok(output.includes('STATUS'), 'output should have "STATUS" column header');
    assert.ok(output.includes('LAST EVENT'), 'output should have "LAST EVENT" column header');
  });
});

test('status --json exposes counts, packets, and backup summary', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const setupIo = fakeIo();
    await main(['task', 'create', '--id', 'ST-002', '--title', 'Status Two', '--write', 'src/**', '--body-file', 'body.md'], setupIo);

    const io = fakeIo();
    assert.equal(await main(['status', '--json'], io), EXIT.OK, io.errLines.join('\n'));
    const parsed: unknown = JSON.parse(io.outLines.join('\n'));
    assert.ok(isRecord(parsed));
    assert.ok(isRecord(parsed.counts));
    assert.ok(Array.isArray(parsed.packets));
    assert.ok(isRecord(parsed.backup));
    assert.equal(parsed.counts.draft, 1);
  });
});
