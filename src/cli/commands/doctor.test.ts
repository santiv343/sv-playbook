import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { main } from '../main.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';
import { createStateBackup } from '../../db/backup.js';
import { BACKUP_REASON } from '../../db/backup.constants.js';
import { openStore } from '../../db/store.js';
import { initTestRepo } from '../../testkit.js';

const execFileAsync = promisify(execFile);
const CLI_PATH = join(process.cwd(), 'bin', 'sv-playbook.js');

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-doctor-'));
  initTestRepo(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

function markPacketDone(id: string): void {
  const store = openStore(process.cwd());
  try {
    store.db.prepare('UPDATE packets SET status = ?, updated_at = ? WHERE id = ?').run('done', new Date().toISOString(), id);
  } finally {
    store.close();
  }
}

test('doctor reports core project health in a git repo', async () => {
  await inTempRepo(async () => {
    const io = fakeIo();
    const code = await main(['doctor'], io);
    const output = io.outLines.join('\n');
    assert.equal(code, EXIT.OK, io.errLines.join('\n'));
    for (const marker of ['node:', 'git:', 'store:', 'packets:', 'leases:', 'backup:']) {
      assert.ok(output.includes(marker), `missing ${marker}`);
    }
  });
});

test('doctor warns when the newest backup is semantically behind the live store', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const setupIo = fakeIo();
    await main(['task', 'create', '--id', 'DOC-BACKUP-001', '--title', 'One', '--write', 'src/**', '--body-file', 'body.md'], setupIo);
    markPacketDone('DOC-BACKUP-001');
    createStateBackup(process.cwd(), { reason: BACKUP_REASON.MANUAL });

    await main(['task', 'create', '--id', 'DOC-BACKUP-002', '--title', 'Two', '--write', 'src/**', '--body-file', 'body.md'], setupIo);
    markPacketDone('DOC-BACKUP-002');

    const io = fakeIo();
    assert.equal(await main(['doctor'], io), EXIT.OK, io.errLines.join('\n'));
    const output = io.outLines.join('\n');
    assert.match(output, /backup: warn/);
    assert.match(output, /newest backup has 1 terminal packet\(s\), live DB has 2/);
  });
});

test('doctor and status can inspect the shared store concurrently', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const setupIo = fakeIo();
    await main(['task', 'create', '--id', 'DOC-CONCURRENT-001', '--title', 'Concurrent', '--write', 'src/**', '--body-file', 'body.md'], setupIo);

    const [doctor, status] = await Promise.all([
      execFileAsync(process.execPath, [CLI_PATH, 'doctor'], { cwd: process.cwd(), encoding: 'utf8' }),
      execFileAsync(process.execPath, [CLI_PATH, 'status'], { cwd: process.cwd(), encoding: 'utf8' }),
    ]);

    assert.doesNotMatch(doctor.stdout, /database is locked/);
    assert.doesNotMatch(status.stdout, /database is locked/);
    assert.match(doctor.stdout, /store: ok/);
    assert.match(status.stdout, /Board:/);
  });
});

test('doctor rejects arguments with usage', async () => {
  const io = fakeIo();
  const code = await main(['doctor', 'extra'], io);
  assert.equal(code, EXIT.USAGE);
  assert.ok(io.errLines.join('\n').includes('Usage: sv-playbook doctor'));
});

test('doctor --json prints machine-readable checks', async () => {
  await inTempRepo(async () => {
    const io = fakeIo();
    assert.equal(await main(['doctor', '--json'], io), EXIT.OK, io.errLines.join('\n'));
    const parsed: unknown = JSON.parse(io.outLines.join('\n'));
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.some((item) => typeof item === 'object' && item !== null && 'label' in item));
  });
});
