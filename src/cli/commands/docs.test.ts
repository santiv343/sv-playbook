import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../main.js';
import type { Io } from '../command.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

test('docs with unknown topic lists available topics and exits 2', async () => {
  const io = fakeIo();
  const code = await main(['docs', 'no-such-topic'], io);
  assert.equal(code, 2);
  assert.ok(io.errLines.join('\n').includes('Unknown topic'));
});

test('docs is a registered command (usage lists it)', async () => {
  const io = fakeIo();
  await main([], io);
  assert.ok(io.errLines.join('\n').includes('docs'));
});
