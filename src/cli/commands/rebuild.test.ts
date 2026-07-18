import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../main.js';
import { command as rebuildCommand } from './rebuild.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';
import { stringColumn } from '../../db/rows.js';
import { openStore } from '../../db/store.js';
import { createPacket } from '../../tasks/service.js';
import { STATUS } from '../../tasks/service.constants.js';
import { initTestRepo } from '../../testkit.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (line) => void outLines.push(line), err: (line) => void errLines.push(line) };
}

async function inTempRepo<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-rebuild-'));
  initTestRepo(root);
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn(root);
  } finally {
    process.chdir(previous);
  }
}

function packetStatus(root: string, id: string): string {
  const store = openStore(root);
  try {
    const row = store.db.prepare('SELECT status FROM packets WHERE id = ?').get(id);
    assert.ok(row !== undefined, `missing packet ${id}`);
    return stringColumn(row, 'status');
  } finally {
    store.close();
  }
}

function seedDonePacket(root: string, id: string): void {
  const store = openStore(root);
  try {
    createPacket(store, root, {
      id,
      title: `Packet ${id}`,
      dependsOn: [],
      writeSet: ['src/**'],
      requirements: [],
      evidenceRequired: [],
    }, 'Body.\n');
    store.db.prepare('UPDATE packets SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(STATUS.DONE, id);
  } finally {
    store.close();
  }
}

test('rebuild failure leaves the live database intact', async () => {
  await inTempRepo(async (root) => {
    seedDonePacket(root, 'REBUILD-SAFE-001');
    await mkdir(join(root, 'docs', 'packets'), { recursive: true });
    await writeFile(join(root, 'docs', 'packets', 'BROKEN.md'), 'not valid packet markdown\n', 'utf8');

    const io = fakeIo();
    const code = await main(['rebuild', '--force', '--confirm-destructive'], io);

    assert.equal(code, EXIT.GATE_FAIL);
    assert.equal(packetStatus(root, 'REBUILD-SAFE-001'), STATUS.DONE);
  });
});

test('rebuild derives packet types from the id prefix instead of leaving them empty', async () => {
  await inTempRepo(async (root) => {
    await mkdir(join(root, 'docs', 'packets'), { recursive: true });
    const doc = [
      '---',
      'id: BUG-777',
      'title: fixture bug packet',
      'depends_on: []',
      'write_set: ["src/**"]',
      'requirements: []',
      'evidence_required: []',
      '---',
      '',
      'closed: done',
      '',
    ].join('\n');
    await writeFile(join(root, 'docs', 'packets', 'BUG-777.md'), doc, 'utf8');

    const io = fakeIo();
    const code = await main(['rebuild', '--force', '--confirm-destructive'], io);

    assert.equal(code, EXIT.OK);
    const store = openStore(root);
    try {
      const row = store.db.prepare('SELECT type FROM packets WHERE id = ?').get('BUG-777');
      assert.ok(row !== undefined, 'missing packet BUG-777');
      assert.equal(stringColumn(row, 'type'), 'bug');
    } finally {
      store.close();
    }
  });
});

test('rebuild refuses to replace terminal live state with reconstructed drafts', async () => {
  await inTempRepo(async (root) => {
    seedDonePacket(root, 'REBUILD-LOSS-001');

    const io = fakeIo();
    const code = await main(['rebuild', '--force', '--confirm-destructive'], io);

    assert.equal(code, EXIT.GATE_FAIL);
    assert.match(io.errLines.join('\n'), /terminal packet/);
    assert.equal(packetStatus(root, 'REBUILD-LOSS-001'), STATUS.DONE);
  });
});

test('rebuild command declares a non-empty usage string', () => {
  assert.notEqual(rebuildCommand.usage.trim(), '');
  assert.match(rebuildCommand.usage, /^Usage: sv-playbook rebuild/);
});
