import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { command as decisionCommand } from './decision.js';
import { command as taskCommand } from './task.js';
import type { Io } from '../command.types.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-decision-'));
  execFileSync('git', ['init'], { cwd: root });
  const prev = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

test('decision ask then answer round-trips and start surfaces the pending question', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const taskIo = fakeIo();
    await taskCommand.run(['create', '--id', 'DEC-TEST-001', '--title', 'Decision Test Packet', '--write', 'src/**', '--body-file', 'body.md'], taskIo);
    await taskCommand.run(['move', 'DEC-TEST-001', 'ready'], taskIo);
    await taskCommand.run(['start', 'DEC-TEST-001'], taskIo);

    {
      const io = fakeIo();
      assert.equal(await decisionCommand.run(['list'], io), 0);
      assert.ok(!io.outLines.join('\n').includes('DEC-001'), 'pending decision should not exist yet');
    }

    let decisionId = '';
    {
      const io = fakeIo();
      assert.equal(await decisionCommand.run(['ask', 'Should we use TypeScript strict mode for new modules?'], io), 0);
      const out = io.outLines.join('\n');
      assert.ok(out.includes('DEC'), 'ask should echo the decision id');
      const match = /asked (DEC-\d+)/.exec(out);
      assert.ok(match !== null && match[1] !== undefined, 'should extract decision id');
      decisionId = match[1];
    }

    {
      const io = fakeIo();
      assert.equal(await decisionCommand.run(['list'], io), 0);
      assert.ok(io.outLines.join('\n').includes(decisionId), 'decision should appear in list');
    }

    {
      const io = fakeIo();
      assert.equal(await decisionCommand.run(['list', '--pending'], io), 0);
      assert.ok(io.outLines.join('\n').includes(decisionId), 'pending decision should appear in --pending list');
    }

    {
      const io = fakeIo();
      assert.equal(await decisionCommand.run(['show', decisionId], io), 0);
      const out = io.outLines.join('\n');
      assert.ok(out.includes('Should we use TypeScript strict mode'), 'show should display the question');
      assert.ok(out.includes('pending'), 'show should indicate pending');
    }

    {
      const io = fakeIo();
      assert.equal(await decisionCommand.run(['answer', decisionId, 'Yes, enforce strict mode everywhere.'], io), 0);
    }

    {
      const io = fakeIo();
      assert.equal(await decisionCommand.run(['show', decisionId], io), 0);
      const out = io.outLines.join('\n');
      assert.ok(out.includes('Yes, enforce strict mode everywhere.'), 'show should display the answer');
      assert.ok(!out.includes('pending'), 'show should not indicate pending after answer');
    }

    {
      const io = fakeIo();
      assert.equal(await decisionCommand.run(['list', '--pending'], io), 0);
      assert.ok(!io.outLines.join('\n').includes(decisionId), 'answered decision should not appear in --pending');
    }
  });
});

test('decision unknown subcommand exits 2 with usage', async () => {
  const io = fakeIo();
  assert.equal(await decisionCommand.run(['frobnicate'], io), 2);
  assert.ok(io.errLines.some((l) => l.includes('Usage')));
});
