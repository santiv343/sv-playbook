import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { command as taskCommand } from './task.js';
import type { Io } from '../command.types.js';
import { stringColumn } from '../../db/rows.js';

function arrayColumn(row: unknown, key: string): unknown[] {
  if (typeof row !== 'object' || row === null) throw new TypeError(`invalid row: expected object for ${key}`);
  for (const [candidate, value] of Object.entries(row)) {
    if (candidate === key) {
      if (!Array.isArray(value)) throw new TypeError(`invalid row: column ${key} must be an array`);
      return value;
    }
  }
  throw new TypeError(`invalid row: missing column ${key}`);
}

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
    const code =       await taskCommand.run(['start', 'P2-102'], io);
    assert.equal(code, 1);
    assert.ok(io.errLines.some((l) => l.includes('wrong state draft')));
  });
});

test('unknown subcommand exits 2 with usage', async () => {
  const io = fakeIo();
  assert.equal(      await taskCommand.run(['frobnicate'], io), 2);
  assert.ok(io.errLines.some((l) => l.includes('Usage')));
});

test('takeover without lease exits 1 with hint; brief prints the packet', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Brief me.\n');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'P3-101', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    const code =       await taskCommand.run(['takeover', 'P3-101'], io);
    assert.equal(code, 1);
    assert.ok(io.errLines.some((l) => l.includes('no lease')));
    const io2 = fakeIo();
    assert.equal(await taskCommand.run(['brief', 'P3-101'], io2), 0);
    assert.ok(io2.outLines.join('\n').includes('Brief me.'));
  });
});

test('release frees an own lease and reports no lease on retry', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'REL-001', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    await taskCommand.run(['move', 'REL-001', 'ready'], io);
    await taskCommand.run(['start', 'REL-001'], io);
    assert.equal(await taskCommand.run(['release', 'REL-001'], io), 0);
    assert.ok(io.outLines.includes('released REL-001'));
    assert.ok(io.outLines.some((line) => line.includes('stays active without a lease')));
    assert.ok(io.outLines.some((line) => line.includes('task takeover REL-001')));
    assert.equal(await taskCommand.run(['release', 'REL-001'], io), 1);
    assert.ok(io.errLines.some((line) => line.includes('no lease')));
  });
});

test('release refuses a lease held by another session with takeover hint', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'REL-002', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    await taskCommand.run(['move', 'REL-002', 'ready'], io);
    await taskCommand.run(['start', 'REL-002'], io);

    await mkdir('other');
    process.chdir('other');
    assert.equal(await taskCommand.run(['release', 'REL-002'], io), 1);
    assert.ok(io.errLines.some((line) => line.includes('lease held by another session')));
    assert.ok(io.errLines.some((line) => line.includes('use takeover')));
  });
});

test('mutating subcommands echo their result', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'ECHO-001', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    await taskCommand.run(['move', 'ECHO-001', 'ready'], io);
    await taskCommand.run(['start', 'ECHO-001'], io);
    await taskCommand.run(['start', 'ECHO-001'], io);
    const out = io.outLines.join('\n');
    assert.ok(out.includes('created'), out);
    assert.ok(out.includes('ready -> active'), out);
    assert.ok(out.includes('already held'), out);
  });
});

test('note then show surfaces the breadcrumb', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'x');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'P3-102', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    await taskCommand.run(['note', 'P3-102', 'checkpoint', 'one'], io);
    const io2 = fakeIo();
    assert.equal(await taskCommand.run(['show', 'P3-102'], io2), 0);
    assert.ok(io2.outLines.some((l) => l.includes('checkpoint one')));
  });
});

test('moving to done creates an automatic state backup', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'x');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'BK-001', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    await taskCommand.run(['move', 'BK-001', 'ready'], io);
    await taskCommand.run(['start', 'BK-001'], io);
    await taskCommand.run(['move', 'BK-001', 'review'], io);
    assert.equal(await taskCommand.run(['move', 'BK-001', 'done'], io), 0);
    const files = await readdir(join(process.cwd(), '.svp', 'backups'));
    assert.ok(files.some((file) => file.endsWith('.sqlite')));
    assert.ok(files.some((file) => file.endsWith('.json')));
  });
});

test('task list and show json expose the full definition including write_set and depends_on', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    await writeFile('dep-body.md', 'Dep task\n');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'DEP-001', '--title', 'Dependency Task', '--write', 'lib/**', '--body-file', 'dep-body.md'], io);
    await taskCommand.run(['move', 'DEP-001', 'ready'], io);

    await taskCommand.run([
      'create', '--id', 'FULL-001', '--title', 'Full Test',
      '--write', 'src/**', '--write', 'test/**',
      '--depends', 'DEP-001',
      '--req', 'REQ-1', '--req', 'REQ-2',
      '--evidence', 'red-test-output', '--evidence', 'verify-root', '--evidence', 'final-sha',
      '--body-file', 'body.md',
    ], io);

    const io2 = fakeIo();
    assert.equal(await taskCommand.run(['list', '--json'], io2), 0);
    const listRaw: unknown = JSON.parse(io2.outLines.join('\n'));
    if (!Array.isArray(listRaw)) throw new Error('expected array');
    const listArr = listRaw;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const fullPacket = listArr.find((p: unknown) => stringColumn(p, 'id') === 'FULL-001');
    assert.ok(fullPacket !== undefined, 'FULL-001 should be in list');
    assert.deepStrictEqual(arrayColumn(fullPacket, 'write_set'), ['src/**', 'test/**']);
    assert.deepStrictEqual(arrayColumn(fullPacket, 'depends_on'), ['DEP-001']);

    const io3 = fakeIo();
    assert.equal(await taskCommand.run(['show', 'FULL-001', '--json'], io3), 0);
    const showData: unknown = JSON.parse(io3.outLines.join('\n'));
    assert.strictEqual(stringColumn(showData, 'packetId'), 'FULL-001');
    assert.strictEqual(stringColumn(showData, 'title'), 'Full Test');
    assert.deepStrictEqual(arrayColumn(showData, 'write_set'), ['src/**', 'test/**']);
    assert.deepStrictEqual(arrayColumn(showData, 'depends_on'), ['DEP-001']);
    assert.strictEqual(stringColumn(showData, 'body'), 'Do it.\n');
    assert.deepStrictEqual(arrayColumn(showData, 'evidence_required'), ['red-test-output', 'verify-root', 'final-sha']);
  });
});
