import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync, rmSync, renameSync, openSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { basename, join, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_FILE, SCHEMA_VERSION, SVP_DIR } from './store.constants.js';
import { BACKUP_PREFIX, BACKUPS_DIR, BACKUP_REASON, BACKUP_RETENTION_DEFAULT } from './backup.constants.js';
import type { BackupOptions, BackupReport, RestoreReport } from './backup.types.js';
import { LEASE_TTL_MS } from '../tasks/service.constants.js';
import { stringColumn, numberColumn } from './rows.js';
import { RestoreError } from './backup.errors.js';

const now = (): string => new Date().toISOString();

function backupsDir(repoRoot: string): string {
  return join(repoRoot, SVP_DIR, BACKUPS_DIR);
}

function dbPath(repoRoot: string): string {
  return join(repoRoot, SVP_DIR, DB_FILE);
}

function stamp(value: string): string {
  return value.replace(/[:\-T.Z]/g, '').slice(0, 14);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function gitValue(repoRoot: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function freshLeaseCountDirect(dbPath: string): number {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath);
  } catch {
    return 0;
  }
  try {
    const rows = db.prepare('SELECT heartbeat_at FROM leases').all();
    let count = 0;
    for (const row of rows) {
      const heartbeatAt = stringColumn(row, 'heartbeat_at');
      if (Date.now() - Date.parse(heartbeatAt) <= LEASE_TTL_MS) count++;
    }
    return count;
  } catch {
    return 0;
  } finally {
    db.close();
  }
}

function trimBackups(repoRoot: string, retention: number): void {
  const dir = backupsDir(repoRoot);
  const entries = readdirSync(dir)
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (let index = retention; index < entries.length; index++) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const sqlitePath = join(dir, entry.name);
    rmSync(sqlitePath);
    const metadataPath = sqlitePath.replace(/\.sqlite$/, '.json');
    if (existsSync(metadataPath)) rmSync(metadataPath);
  }
}

export function latestStateBackupAgeHours(repoRoot: string): number | undefined {
  const dir = backupsDir(repoRoot);
  if (!existsSync(dir)) return undefined;
  const newest = readdirSync(dir)
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => statSync(join(dir, name)).mtimeMs)
    .sort((a, b) => b - a)
    .at(0);
  if (newest === undefined) return undefined;
  return (Date.now() - newest) / (60 * 60 * 1000);
}

function writeMetadata(repoRoot: string, report: BackupReport, reason: string): void {
  const metadata = {
    dbFile: basename(report.sqlitePath),
    reason,
    schemaVersion: SCHEMA_VERSION,
    createdAt: report.createdAt,
    sourceBranch: gitValue(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']),
    sourceSha: gitValue(repoRoot, ['rev-parse', 'HEAD']),
    sizeBytes: report.sizeBytes,
    sha256: report.sha256,
  };
  writeFileSync(report.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function vacuumInto(sourcePath: string, destPath: string): void {
  const db = new DatabaseSync(sourcePath);
  try {
    const escaped = destPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}'`);
  } finally {
    db.close();
  }
}

function rawPreRestoreBackup(repoRoot: string, retention?: number): BackupReport {
  mkdirSync(backupsDir(repoRoot), { recursive: true });
  const createdAt = now();
  const sqlitePath = join(backupsDir(repoRoot), `${BACKUP_PREFIX}-${stamp(createdAt)}-pre-restore.sqlite`);
  const metadataPath = sqlitePath.replace(/\.sqlite$/, '.json');
  try {
    vacuumInto(dbPath(repoRoot), sqlitePath);
  } catch {
    copyFileSync(dbPath(repoRoot), sqlitePath);
  }
  const report: BackupReport = {
    sqlitePath,
    metadataPath,
    createdAt,
    sha256: sha256(sqlitePath),
    sizeBytes: statSync(sqlitePath).size,
  };
  writeMetadata(repoRoot, report, BACKUP_REASON.PRE_RESTORE);
  trimBackups(repoRoot, retention ?? BACKUP_RETENTION_DEFAULT);
  return report;
}

export function createStateBackup(repoRoot: string, options: BackupOptions): BackupReport {
  const freshLeases = freshLeaseCountDirect(dbPath(repoRoot));
  if (freshLeases > 0 && options.allowFreshLeases !== true) {
    throw new Error(`backup refused: ${freshLeases} live lease(s)`);
  }
  mkdirSync(backupsDir(repoRoot), { recursive: true });
  const createdAt = now();
  const sqlitePath = join(backupsDir(repoRoot), `${BACKUP_PREFIX}-${stamp(createdAt)}.sqlite`);
  const metadataPath = sqlitePath.replace(/\.sqlite$/, '.json');
  vacuumInto(dbPath(repoRoot), sqlitePath);
  const report: BackupReport = {
    sqlitePath,
    metadataPath,
    createdAt,
    sha256: sha256(sqlitePath),
    sizeBytes: statSync(sqlitePath).size,
  };
  writeMetadata(repoRoot, report, options.reason);
  trimBackups(repoRoot, options.retention ?? BACKUP_RETENTION_DEFAULT);
  return report;
}

function checkDbIntegrity(db: DatabaseSync): void {
  let integrityRow: unknown;
  let versionRow: unknown;
  try {
    integrityRow = db.prepare('PRAGMA integrity_check').get();
    versionRow = db.prepare('PRAGMA user_version').get();
  } catch (error) {
    throw new RestoreError(`backup integrity_check failed: ${error instanceof Error ? error.message : String(error)}; restore a known-good backup instead`);
  }
  const integrityCheck = stringColumn(integrityRow, 'integrity_check');
  if (integrityCheck !== 'ok') {
    throw new RestoreError(`backup integrity_check failed: ${integrityCheck}; restore a known-good backup instead`);
  }
  const userVersion = numberColumn(versionRow, 'user_version');
  if (userVersion !== SCHEMA_VERSION) {
    throw new RestoreError(`backup schema version ${userVersion} does not match expected ${SCHEMA_VERSION}; restore a compatible backup or migrate first`);
  }
}

interface BackupMetadata {
  sha256: string;
}

function isBackupMetadata(value: unknown): value is BackupMetadata {
  if (typeof value !== 'object' || value === null) return false;
  for (const [key, val] of Object.entries(value)) {
    if (key === 'sha256') return typeof val === 'string';
  }
  return false;
}

function validateMetadata(backupPath: string): void {
  const metadataPath = backupPath.replace(/\.sqlite$/, '.json');
  if (!existsSync(metadataPath)) return;
  const parsed: unknown = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (!isBackupMetadata(parsed)) {
    throw new RestoreError('backup metadata is missing sha256 field');
  }
  const actualSha256 = sha256(backupPath);
  if (parsed.sha256 !== actualSha256) {
    throw new RestoreError(`backup sha256 mismatch (metadata: ${parsed.sha256}, actual: ${actualSha256}); the backup file has been tampered with or corrupted`);
  }
}

function validateBackup(backupPath: string): void {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(backupPath);
  } catch (error) {
    throw new RestoreError(`backup integrity_check failed: file is not a valid SQLite database (${error instanceof Error ? error.message : String(error)}); restore a known-good backup instead`);
  }
  try {
    checkDbIntegrity(db);
  } finally {
    db.close();
  }
  validateMetadata(backupPath);
}

function isValidSQLite(path: string): boolean {
  if (!existsSync(path)) return false;
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = readSync(fd, buf, 0, 16, 0);
    return n === 16 && buf.toString('utf8', 0, 16) === 'SQLite format 3\0';
  } finally {
    closeSync(fd);
  }
}

function preRestoreBackup(repoRoot: string, force: boolean, retention?: number): BackupReport {
  try {
    return createStateBackup(repoRoot, {
      reason: BACKUP_REASON.PRE_RESTORE,
      allowFreshLeases: force,
      ...(retention === undefined ? {} : { retention }),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('backup refused:')) throw error;
    return rawPreRestoreBackup(repoRoot, retention);
  }
}

export function restoreStateBackup(repoRoot: string, backupPath: string, force: boolean, retention?: number): RestoreReport {
  if (!existsSync(backupPath)) throw new Error(`backup file not found: ${backupPath}`);

  const liveDbPath = dbPath(repoRoot);
  const freshLeases = freshLeaseCountDirect(liveDbPath);
  if (freshLeases > 0 && !force) {
    throw new Error(`backup refused: ${freshLeases} live lease(s)`);
  }

  const preRestore = isValidSQLite(liveDbPath)
    ? preRestoreBackup(repoRoot, force, retention)
    : rawPreRestoreBackup(repoRoot, retention);

  validateBackup(backupPath);

  const target = liveDbPath;
  const tempPath = join(dirname(target), `.${basename(target)}.tmp`);
  copyFileSync(backupPath, tempPath);
  try {
    renameSync(tempPath, target);
  } finally {
    if (existsSync(tempPath)) {
      rmSync(tempPath);
    }
  }

  return { restoredFrom: backupPath, preRestoreBackup: preRestore };
}
