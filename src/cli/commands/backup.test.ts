import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { main } from '../main.js';
import { EXIT } from '../command.constants.js';
import { openStore, resolveStoreDir } from '../../db/store.js';
import type { Io } from '../command.types.js';
import { initTestRepo } from '../../testkit.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (line) => void outLines.push(line), err: (line) => void errLines.push(line) };
}

async function inTempRepo<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-backup-'));
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

function backupFiles(root: string): string[] {
  return readdirSync(join(resolveStoreDir(root), 'backups')).filter((name) => name.endsWith('.sqlite'));
}

test('backup state creates a sqlite snapshot with metadata', async () => {
  await inTempRepo(async (root) => {
    openStore(root).close();
    const io = fakeIo();
    const code = await main(['backup', 'state'], io);
    assert.equal(code, EXIT.OK, io.errLines.join('\n'));
    const files = backupFiles(root);
    assert.ok(files.length >= 1);
    const newest = files.toSorted().at(-1);
    assert.ok(newest !== undefined);
    assert.ok(existsSync(join(resolveStoreDir(root), 'backups', newest.replace(/\.sqlite$/, '.json'))));
    assert.ok(io.outLines.some((line) => line.includes('backup:')));
  });
});

test('restore state replaces the current store from a backup file', async () => {
  await inTempRepo(async (root) => {
    openStore(root).close();
    const backupIo = fakeIo();
    assert.equal(await main(['backup', 'state'], backupIo), EXIT.OK);
    const backupName = backupFiles(root).toSorted().at(-1);
    assert.ok(backupName !== undefined);
    const backupPath = join(resolveStoreDir(root), 'backups', backupName);
    await writeFile(join(resolveStoreDir(root), 'playbook.sqlite'), 'not sqlite');

    const restoreIo = fakeIo();
    assert.equal(await main(['restore', 'state', '--file', backupPath, '--confirm-destructive'], restoreIo), EXIT.OK, restoreIo.errLines.join('\n'));
    const store = openStore(root);
    store.close();
    assert.ok(restoreIo.outLines.some((line) => line.includes('restored:')));
  });
});

test('backup state rejects arguments outside the state subcommand', async () => {
  const io = fakeIo();
  assert.equal(await main(['backup'], io), EXIT.USAGE);
  assert.ok(io.errLines.join('\n').includes('Usage: sv-playbook backup state'));
});
