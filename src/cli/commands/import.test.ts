import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command as importCommand } from './import.js';
import type { Io } from '../command.types.js';
import { stringColumn } from '../../db/rows.js';
import { initTestRepo } from '../../testkit.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = []; const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-import-'));
  initTestRepo(root);
  const prev = process.cwd();
  process.chdir(root);
  try { return await fn(); } finally { process.chdir(prev); }
}

test('import loads a packet body and its deps from markdown into the DB', async () => {
  await inTempRepo(async () => {
    const { openStore: openStoreFn } = await import('../../db/store.js');
    const tempStore = openStoreFn(process.cwd());
    tempStore.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('DEP-001', 'Dependency', '/tmp/dep', 'draft', '[]', datetime('now'), datetime('now'))").run();
    tempStore.close();

    await mkdir(join('docs', 'packets'), { recursive: true });
    const content = [
      '---',
      'id: IMP-001',
      'title: Import Test Packet',
      'depends_on: ["DEP-001"]',
      'write_set: ["src/import/**"]',
      'requirements: []',
      'evidence_required: ["final-sha"]',
      '---',
      '',
      'This is the imported body.',
    ].join('\n');
    await writeFile(join('docs', 'packets', 'IMP-001.md'), content, 'utf8');

    const io = fakeIo();
    const code = await importCommand.run([], io);
    assert.equal(code, 0);

    const { openStore } = await import('../../db/store.js');
    const store = openStore(process.cwd());
    const row = store.db.prepare('SELECT body, title, write_set FROM packets WHERE id = ?').get('IMP-001');
    assert.ok(row !== undefined, 'packet must exist in DB');
    assert.equal(stringColumn(row, 'body'), 'This is the imported body.');
    assert.equal(stringColumn(row, 'title'), 'Import Test Packet');

    const deps = store.db.prepare('SELECT depends_on_id FROM packet_deps WHERE packet_id = ? ORDER BY depends_on_id').all('IMP-001');
    assert.equal(deps.length, 1);
    assert.equal(stringColumn(deps[0], 'depends_on_id'), 'DEP-001');

    store.close();
  });
});

test('import command declares a non-empty usage string', () => {
  assert.notEqual(importCommand.usage.trim(), '');
  assert.match(importCommand.usage, /^Usage: sv-playbook import/);
});
