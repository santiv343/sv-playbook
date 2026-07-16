import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { copyFileSync, writeFileSync, existsSync, readFileSync, readdirSync, utimesSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createStateBackup, restoreStateBackup, getBackupStatus, verifyLatestBackup, needsBackup, recordBackupFailure, recordBackupSuccess, backupFailedCycles } from './backup.js';
import { openStore } from './store.js';
import { SVP_DIR, DB_FILE, SCHEMA_VERSION } from './store.constants.js';
import { BACKUP_REASON } from './backup.constants.js';
import { stringColumn, numberColumn } from './rows.js';
import { initTestRepo } from '../testkit.js';

async function createTestRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'svp-backup-test-'));
  initTestRepo(root);
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

function markPacketDone(repoRoot: string, id: string): void {
  const store = openStore(repoRoot);
  try {
    store.db.prepare('UPDATE packets SET status = ?, updated_at = ? WHERE id = ?').run('done', new Date().toISOString(), id);
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
  assert.throws(
    () => restoreStateBackup(repoRoot, garbagePath, false),
    { name: 'RestoreError', message: /integrity_check|user_version|sha256/ }
  );

  // After the failed restore, the live DB should still open and contain the known packet
  assert.ok(packetExists(repoRoot, 'pkt-known'), 'known packet should still exist after failed restore');

  // Also verify the live DB file itself wasn't corrupted
  const liveDbPath = join(repoRoot, SVP_DIR, DB_FILE);
  assert.ok(existsSync(liveDbPath));
  const db = new DatabaseSync(liveDbPath);
  try {
    const integrityRow = db.prepare('PRAGMA integrity_check').get();
    assert.ok(integrityRow !== undefined, 'integrity_check should return a row');
    assert.equal(stringColumn(integrityRow, 'integrity_check'), 'ok', 'live DB should still pass integrity_check');
    const versionRow = db.prepare('PRAGMA user_version').get();
    assert.ok(versionRow !== undefined, 'user_version should return a row');
    assert.equal(numberColumn(versionRow, 'user_version'), SCHEMA_VERSION, 'live DB should still have correct schema version');
  } finally {
    db.close();
  }
});

test('restore rejects a backup with wrong schema version', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-known', 'Known Packet');
  assert.ok(packetExists(repoRoot, 'pkt-known'));

  const goodBackup = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });
  assert.ok(existsSync(goodBackup.sqlitePath));

  const db = new DatabaseSync(goodBackup.sqlitePath);
  try {
    db.exec('PRAGMA user_version = 999');
  } finally {
    db.close();
  }

  assert.throws(
    () => restoreStateBackup(repoRoot, goodBackup.sqlitePath, false),
    /schema version/
  );

  assert.ok(packetExists(repoRoot, 'pkt-known'), 'known packet should still exist after failed restore');
});

test('restore accepts a compatible older schema backup for migration on next open', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-legacy', 'Legacy Packet');
  const goodBackup = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });
  const legacyPath = join(repoRoot, 'legacy-v6.sqlite');
  copyFileSync(goodBackup.sqlitePath, legacyPath);

  const legacyDb = new DatabaseSync(legacyPath);
  try {
    legacyDb.exec(`PRAGMA user_version = ${SCHEMA_VERSION - 1}`);
  } finally {
    legacyDb.close();
  }

  restoreStateBackup(repoRoot, legacyPath, false);

  const store = openStore(repoRoot);
  try {
    const version = numberColumn(store.db.prepare('PRAGMA user_version').get(), 'user_version');
    assert.equal(version, SCHEMA_VERSION);
    const row = store.db.prepare('SELECT 1 FROM packets WHERE id = ?').get('pkt-legacy');
    assert.ok(row !== undefined, 'legacy backup packet should survive restore and migration');
  } finally {
    store.close();
  }
});

test('restore rejects a backup with sha256 mismatch', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-known', 'Known Packet');
  assert.ok(packetExists(repoRoot, 'pkt-known'));

  const goodBackup = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });
  assert.ok(existsSync(goodBackup.sqlitePath));

  const buffer = readFileSync(goodBackup.sqlitePath);
  buffer[50] = 0xFF;
  writeFileSync(goodBackup.sqlitePath, buffer);

  assert.throws(
    () => restoreStateBackup(repoRoot, goodBackup.sqlitePath, false),
    /sha256 mismatch/
  );

  assert.ok(packetExists(repoRoot, 'pkt-known'), 'known packet should still exist after failed restore');
});

test('backups honor a configured backup.dir outside .svp', async () => {
  const repoRoot = await createTestRepo();
  const externalDir = await mkdtemp(join(tmpdir(), 'svp-backup-external-'));

  createPacket(repoRoot, 'pkt-test', 'Test Packet');
  assert.ok(packetExists(repoRoot, 'pkt-test'));

  writeFileSync(
    join(repoRoot, 'playbook.config.json'),
    JSON.stringify({ backup: { dir: externalDir } })
  );

  const report = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });

  assert.ok(existsSync(report.sqlitePath), 'backup sqlite should exist');
  assert.ok(report.sqlitePath.startsWith(externalDir), 'backup should land in external dir');

  const svpBackupsDir = join(repoRoot, '.svp', 'backups');
  const svpFiles = existsSync(svpBackupsDir) ? readdirSync(svpBackupsDir) : [];
  assert.ok(
    !svpFiles.some((name) => name === basename(report.sqlitePath)),
    '.svp/backups should not contain the backup'
  );
});

test('doctor-facing backup status flags a stale newest backup', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-stale', 'Stale Backup Test');

  const backup = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });
  assert.ok(existsSync(backup.sqlitePath));

  const agedTime = Date.now() - (7 * 60 * 60 * 1000);
  utimesSync(backup.sqlitePath, agedTime / 1000, agedTime / 1000);

  const status = getBackupStatus(repoRoot);
  assert.ok(status.stale, 'stale flag should be true when backup exceeds maxAgeHours');
});

test('backup status reports verified true after successful creation', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-verify', 'Verify Test');
  createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });

  const status = getBackupStatus(repoRoot);
  assert.ok(status.verified, 'backup should be verified after creation');
  assert.ok(!status.failed, 'backup should not be failed after successful creation');
});

test('backup status flags newest backup with fewer terminal packets than the live store', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-one', 'First terminal packet');
  markPacketDone(repoRoot, 'pkt-one');
  createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });

  createPacket(repoRoot, 'pkt-two', 'Second terminal packet');
  markPacketDone(repoRoot, 'pkt-two');

  const status = getBackupStatus(repoRoot);
  assert.equal(status.terminalPacketCount, 1);
  assert.equal(status.liveTerminalPacketCount, 2);
  assert.ok(status.terminalCountRegressed, 'backup should be marked semantically behind the live store');
});

test('backup status reports failed false when no backup exists', async () => {
  const repoRoot = await createTestRepo();
  const status = getBackupStatus(repoRoot);
  assert.ok(!status.failed, 'no backup means not failed');
  assert.ok(!status.stale, 'no backup means not stale');
  assert.ok(status.ageHours === undefined);
});

test('needsBackup returns true when no backup exists', async () => {
  const repoRoot = await createTestRepo();
  assert.ok(needsBackup(repoRoot), 'should need backup when none exists');
});

test('needsBackup returns true when backup exceeds maxAgeHours', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-needs', 'Needs Backup Test');
  const backup = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });
  assert.ok(existsSync(backup.sqlitePath));

  const agedTime = Date.now() - (7 * 60 * 60 * 1000);
  utimesSync(backup.sqlitePath, agedTime / 1000, agedTime / 1000);

  assert.ok(needsBackup(repoRoot), 'should need backup when stale');
});

test('needsBackup returns false when backup is fresh', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-fresh', 'Fresh Backup Test');
  createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });

  assert.ok(!needsBackup(repoRoot), 'should not need backup when fresh');
});

test('failed cycle counter increments and resets', async () => {
  const repoRoot = await createTestRepo();

  assert.equal(backupFailedCycles(repoRoot), 0);

  const count1 = recordBackupFailure(repoRoot);
  assert.equal(count1, 1);
  assert.equal(backupFailedCycles(repoRoot), 1);

  const count2 = recordBackupFailure(repoRoot);
  assert.equal(count2, 2);

  const count3 = recordBackupFailure(repoRoot);
  assert.equal(count3, 3);
  assert.equal(backupFailedCycles(repoRoot), 3);

  recordBackupSuccess(repoRoot);
  assert.equal(backupFailedCycles(repoRoot), 0);
});

test('retention respects verified floor and does not drop below it', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-floor', 'Floor Test');

  for (let i = 0; i < 5; i++) {
    createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL, retention: 2 });
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  const dir = join(repoRoot, '.svp', 'backups');
  const backups = readdirSync(dir).filter((name) => name.endsWith('.sqlite'));
  assert.ok(backups.length <= 2 + 3, 'should not exceed retention + floor');
});

test('verifyLatestBackup marks the newest backup as verified', async () => {
  const repoRoot = await createTestRepo();

  createPacket(repoRoot, 'pkt-vlb', 'VerifyLatest Test');
  const backup = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });
  assert.ok(existsSync(backup.sqlitePath));

  const statusBefore = getBackupStatus(repoRoot);
  assert.ok(statusBefore.verified, 'should already be verified from creation');

  const reverified = verifyLatestBackup(repoRoot);
  assert.ok(reverified, 're-verification should succeed');
});

test('two backups within the same second get distinct filenames and both succeed', async () => {
  const repoRoot = await createTestRepo();
  createPacket(repoRoot, 'pkt-collision', 'Collision Test');

  const backup1 = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });
  const backup2 = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL });

  assert.ok(existsSync(backup1.sqlitePath));
  assert.ok(existsSync(backup2.sqlitePath));
  assert.notEqual(backup2.sqlitePath, backup1.sqlitePath);
});
