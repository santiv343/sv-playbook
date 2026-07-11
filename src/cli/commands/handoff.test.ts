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
  const root = await mkdtemp(join(tmpdir(), 'svp-handoff-'));
  execFileSync('git', ['init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

test('handoff prompt includes the role pointer and the live board snapshot', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const setupIo = fakeIo();
    await main(
      ['task', 'create', '--id', 'HANDOFF-TEST-001', '--title', 'Handoff Test One', '--write', 'src/**', '--body-file', 'body.md'],
      setupIo,
    );
    await main(['task', 'move', 'HANDOFF-TEST-001', 'ready'], setupIo);

    const io = fakeIo();
    assert.equal(await main(['handoff'], io), EXIT.OK, io.errLines.join('\n'));
    const output = io.outLines.join('\n');
    assert.ok(output.includes('docs roles/orchestrator'), 'output must include role pointer');
    assert.ok(output.includes('HANDOFF-TEST-001'), 'output must include ready packet id');
    assert.ok(output.includes('counts:'), 'output must include counts header');
  });
});

test('handoff handles numeric event sequences for active packets', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const setupIo = fakeIo();
    await main(
      ['task', 'create', '--id', 'HANDOFF-NUM-001', '--title', 'Numeric Seq Test', '--write', 'src/**', '--body-file', 'body.md'],
      setupIo,
    );
    await main(['task', 'move', 'HANDOFF-NUM-001', 'ready'], setupIo);
    assert.equal(await main(['task', 'start', 'HANDOFF-NUM-001'], setupIo), EXIT.OK, setupIo.errLines.join('\n'));

    const io = fakeIo();
    assert.equal(await main(['handoff', '--force'], io), EXIT.OK, io.errLines.join('\n'));
    const output = io.outLines.join('\n');
    assert.ok(output.includes('counts:'), 'output must include counts header');
  });
});
