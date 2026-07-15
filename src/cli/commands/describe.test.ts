import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../main.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';

const EXPECTED_COMMAND = {
  DOCS: 'docs', TASK: 'task', DOCTOR: 'doctor', BACKUP: 'backup', RESTORE: 'restore', STATUS: 'status', REBUILD: 'rebuild',
} as const;

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

test('describe prints a JSON catalog containing docs, task, doctor, backup, restore, status, and rebuild', async () => {
  const io = fakeIo();
  const code = await main(['describe'], io);
  assert.equal(code, EXIT.OK, io.errLines.join('\n'));
  const catalog = parseCatalog(io.outLines.join('\n'));
  const docs = catalog.find((e) => e.name === EXPECTED_COMMAND.DOCS);
  const task = catalog.find((e) => e.name === EXPECTED_COMMAND.TASK);
  const doctor = catalog.find((e) => e.name === EXPECTED_COMMAND.DOCTOR);
  const backup = catalog.find((e) => e.name === EXPECTED_COMMAND.BACKUP);
  const restore = catalog.find((e) => e.name === EXPECTED_COMMAND.RESTORE);
  const status = catalog.find((e) => e.name === EXPECTED_COMMAND.STATUS);
  const rebuild = catalog.find((e) => e.name === EXPECTED_COMMAND.REBUILD);
  assert.ok(docs, 'missing docs entry');
  assert.ok(task, 'missing task entry');
  assert.ok(doctor, 'missing doctor entry');
  assert.ok(backup, 'missing backup entry');
  assert.ok(restore, 'missing restore entry');
  assert.ok(status, 'missing status entry');
  assert.ok(rebuild, 'missing rebuild entry');
  assert.ok(typeof docs.summary === 'string' && docs.summary.length > 0, 'docs summary empty');
  assert.ok(typeof task.summary === 'string' && task.summary.length > 0, 'task summary empty');
  assert.ok(typeof doctor.summary === 'string' && doctor.summary.length > 0, 'doctor summary empty');
  assert.ok(typeof backup.summary === 'string' && backup.summary.length > 0, 'backup summary empty');
  assert.ok(typeof restore.summary === 'string' && restore.summary.length > 0, 'restore summary empty');
  assert.ok(typeof status.summary === 'string' && status.summary.length > 0, 'status summary empty');
  assert.ok(typeof rebuild.summary === 'string' && rebuild.summary.length > 0, 'rebuild summary empty');
});
