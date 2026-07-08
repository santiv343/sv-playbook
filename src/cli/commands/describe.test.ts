import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../main.js';
import type { Io } from '../command.js';
import { EXIT } from '../command.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCatalog(text: string): Array<{ name: string; summary: string }> {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error('expected array');
  return raw.reduce<Array<{ name: string; summary: string }>>((acc, item) => {
    if (!isRecord(item)) return acc;
    if (typeof item.name === 'string' && typeof item.summary === 'string') {
      acc.push({ name: item.name, summary: item.summary });
    }
    return acc;
  }, []);
}

test('describe prints a JSON catalog containing docs and task', async () => {
  const io = fakeIo();
  const code = await main(['describe'], io);
  assert.equal(code, EXIT.OK, io.errLines.join('\n'));
  const catalog = parseCatalog(io.outLines.join('\n'));
  const docs = catalog.find((e) => e.name === 'docs');
  const task = catalog.find((e) => e.name === 'task');
  assert.ok(docs, 'missing docs entry');
  assert.ok(task, 'missing task entry');
  assert.ok(typeof docs.summary === 'string' && docs.summary.length > 0, 'docs summary empty');
  assert.ok(typeof task.summary === 'string' && task.summary.length > 0, 'task summary empty');
});
