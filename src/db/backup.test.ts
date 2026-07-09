import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createStateBackup, restoreStateBackup } from './backup.js';
import { openStore } from './store.js';
import { SVP_DIR, DB_FILE, SCHEMA_VERSION } from './store.constants.js';
import { BACKUP_REASON } from './backup.constants.js';
import { createHash } from 'node:crypto';

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function createTestRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'svp-backup-test-'));
  execFileSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root });
  writeFileSync(join(root, 'README.md'), '# Test\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: root });
  return root;
}

function createPacket(repoRoot: string, id: string, title: string): void {
  const store = openStore(repoRoot);
  try {
    store.db.prepare(`
      INSERT INTO packets (id, title, path, status, write_set, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, `packets/${id}.md`, 'draft', '[]', 100, new Date().toISOString(), new Date().toISOString());
  } finally {
    store.close();
  }
}

function packetExists(repoRoot: string, id: string): boolean {
  const store = openStore(repoRoot);
  try {
    const row = store.db.prepare('SELECT 1 FROM packets WHERE id = ?').get(id);
    return row !== undefined;
  } finally {
    store.close();
  }
}

test('restore refuses a corrupt backup and leaves the live database intact', async () => {
  const repoRoot = await createTestRepo();
  
  // Create a store with one known packet
  createPacket(repoRoot, 'pkt-known', 'Known Packet');
  assert.ok(packetExists(repoRoot, 'pkt-known'));
  
  // Take a good backup
  const goodBackup = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });
  assert.ok(existsSync(goodBackup.sqlitePath));
  
  // Write a garbage/truncated file to some path
  const garbagePath = join(repoRoot, 'garbage.sqlite');
  writeFileSync(garbagePath, 'not a sqlite database at all');
  
  // Try to restore from the garbage backup - should throw RestoreError
  await assert.rejects(
    async () => {
      restoreStateBackup(repoRoot, garbagePath, false);
    },
    { name: 'RestoreError', message: /integrity_check|user_version|sha256/ }
  );
  
  // After the failed restore, the live DB should still open and contain the known packet
  assert.ok(packetExists(repoRoot, 'pkt-known'), 'known packet should still exist after failed restore');
  
  // Also verify the live DB file itself wasn't corrupted
  const liveDbPath = join(repoRoot, SVP_DIR, DB_FILE);
  assert.ok(existsSync(liveDbPath));
  const db = new DatabaseSync(liveDbPath);
  try {
    const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string } | undefined;
    assert.ok(row, 'integrity_check should return a row');
    assert.equal(row.integrity_check, 'ok', 'live DB should still pass integrity_check');
    const versionRow = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
    assert.ok(versionRow, 'user_version should return a row');
    assert.equal(versionRow.user_version, SCHEMA_VERSION, 'live DB should still have correct schema version');
  } finally {
    db.close();
  }
});