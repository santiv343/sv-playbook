import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync, rmSync, renameSync, openSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { basename, join, dirname, isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_FILE, SCHEMA_VERSION, SVP_DIR } from './store.constants.js';
import { BACKUP_PREFIX, BACKUPS_DIR, BACKUP_REASON, BACKUP_RETENTION_DEFAULT, BACKUP_RETENTION_FLOOR_DEFAULT } from './backup.constants.js';
import type { BackupOptions, BackupReport, BackupStatus, RestoreReport } from './backup.types.js';
import { LEASE_TTL_MS } from '../tasks/service.constants.js';
import { stringColumn, numberColumn } from './rows.js';
import { RestoreError } from './backup.errors.js';
import { loadConfig } from '../config.js';
import { terminalPacketCountAt } from './inspection.js';

const now = (): string => new Date().toISOString();
const MIN_RESTORABLE_SCHEMA_VERSION = 3;
const stamp = (v: string): string => {
  const base = v.replace(/[:\-T.Z]/g, '').slice(0, 17);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
};

function resolveBackupsDir(repoRoot: string): string {
  const config = loadConfig(repoRoot);
  if (config.backup.dir !== undefined) {
    if (isAbsolute(config.backup.dir)) return config.backup.dir;
    return join(repoRoot, config.backup.dir);
  }
  return join(repoRoot, SVP_DIR, BACKUPS_DIR);
}

function dbPath(repoRoot: string): string { return join(repoRoot, SVP_DIR, DB_FILE); }

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function gitValue(repoRoot: string, args: string[]): string {
  try { return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

function freshLeaseCountDirect(dbPath: string): number {
  let db: DatabaseSync;
  try { db = new DatabaseSync(dbPath); } catch { return 0; }
  try {
    const rows = db.prepare('SELECT heartbeat_at FROM leases').all();
    let count = 0;
    for (const row of rows) {
      if (Date.now() - Date.parse(stringColumn(row, 'heartbeat_at')) <= LEASE_TTL_MS) count++;
    }
    return count;
  } catch { return 0; } finally { db.close(); }
}

function trimBackups(resolvedDir: string, retention: number, floor?: number): void {
  const effectiveFloor = floor ?? BACKUP_RETENTION_FLOOR_DEFAULT;
  const entries = readdirSync(resolvedDir)
    .filter((n) => n.endsWith('.sqlite'))
    .map((name) => {
      const mp = join(resolvedDir, name.replace(/\.sqlite$/, '.json'));
      let verified = false;
      if (existsSync(mp)) {
        try {
          const m: unknown = JSON.parse(readFileSync(mp, 'utf8'));
          if (isRecord(m)) verified = m.verified === true;
        } catch { /* ignore */ }
      }
      return { name, mtime: statSync(join(resolvedDir, name)).mtimeMs, verified };
    })
    .sort((a, b) => b.mtime - a.mtime);
  let verifiedCount = entries.filter((e) => e.verified).length;
  for (let i = retention; i < entries.length; i++) {
    const e = entries[i];
    if (!e || (e.verified && verifiedCount <= effectiveFloor)) continue;
    rmSync(join(resolvedDir, e.name));
    const mp = join(resolvedDir, e.name.replace(/\.sqlite$/, '.json'));
    if (existsSync(mp)) rmSync(mp);
    if (e.verified) verifiedCount--;
  }
}

function failuresPath(repoRoot: string): string {
  return join(resolveBackupsDir(repoRoot), '.backup-failures.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function failuresCount(repoRoot: string): number {
  const p = failuresPath(repoRoot);
  if (!existsSync(p)) return 0;
  try {
    const r: unknown = JSON.parse(readFileSync(p, 'utf8'));
    if (!isRecord(r)) return 0;
    const c = r.count;
    return typeof c === 'number' ? c : 0;
  } catch { return 0; }
}

function setFailuresCount(repoRoot: string, count: number): void {
  const p = failuresPath(repoRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ count, updatedAt: new Date().toISOString() }), 'utf8');
}

function markBackupVerified(sqlitePath: string): void {
  const mp = sqlitePath.replace(/\.sqlite$/, '.json');
  if (!existsSync(mp)) return;
  const m: unknown = JSON.parse(readFileSync(mp, 'utf8'));
  if (!isRecord(m)) return;
  m.verified = true;
  m.verified_at = new Date().toISOString();
  writeFileSync(mp, JSON.stringify(m, null, 2) + '\n', 'utf8');
}

interface NewestBackupMeta { verified: boolean; failedCycles: number; terminalPacketCount: number | undefined; }
function metadataTerminalPacketCount(raw: Record<string, unknown>): number | undefined {
  const value = raw.terminalPacketCount;
  return typeof value === 'number' ? value : undefined;
}

function newestBackupMeta(dir: string): NewestBackupMeta {
  if (!existsSync(dir)) return { verified: false, failedCycles: 0, terminalPacketCount: undefined };
  const newest = readdirSync(dir).filter((n) => n.endsWith('.sqlite'))
    .map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t).at(0);
  if (!newest) return { verified: false, failedCycles: 0, terminalPacketCount: undefined };
  const sqlitePath = join(dir, newest.n);
  const mp = join(dir, newest.n.replace(/\.sqlite$/, '.json'));
  if (!existsSync(mp)) {
    return { verified: false, failedCycles: 0, terminalPacketCount: terminalPacketCountAt(sqlitePath) };
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(mp, 'utf8'));
    if (!isRecord(raw)) {
      return { verified: false, failedCycles: 0, terminalPacketCount: terminalPacketCountAt(sqlitePath) };
    }
    const v = raw.verified === true;
    const fc = raw.failed_cycles;
    return {
      verified: v,
      failedCycles: typeof fc === 'number' ? fc : 0,
      terminalPacketCount: metadataTerminalPacketCount(raw) ?? terminalPacketCountAt(sqlitePath),
    };
  } catch {
    return { verified: false, failedCycles: 0, terminalPacketCount: terminalPacketCountAt(sqlitePath) };
  }
}

export function getBackupStatus(repoRoot: string, maxAgeHours?: number): BackupStatus {
  const config = loadConfig(repoRoot);
  const age = latestStateBackupAgeHours(repoRoot);
  const stale = age !== undefined && age >= (maxAgeHours ?? config.backup.maxAgeHours);
  const meta = age !== undefined
    ? newestBackupMeta(resolveBackupsDir(repoRoot))
    : { verified: false, failedCycles: 0, terminalPacketCount: undefined };
  const liveTerminalPacketCount = terminalPacketCountAt(dbPath(repoRoot));
  const terminalCountRegressed = meta.terminalPacketCount !== undefined
    && liveTerminalPacketCount !== undefined
    && meta.terminalPacketCount < liveTerminalPacketCount;
  return {
    ageHours: age,
    stale,
    verified: meta.verified,
    failed: age !== undefined && !meta.verified,
    failedCycles: meta.failedCycles + failuresCount(repoRoot),
    terminalPacketCount: meta.terminalPacketCount,
    liveTerminalPacketCount,
    terminalCountRegressed,
  };
}

export function verifyLatestBackup(repoRoot: string): boolean {
  const dir = resolveBackupsDir(repoRoot);
  if (!existsSync(dir)) return false;
  const newest = readdirSync(dir).filter((n) => n.endsWith('.sqlite'))
    .map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t).at(0);
  if (!newest) return false;
  try { validateBackup(join(dir, newest.n)); markBackupVerified(join(dir, newest.n)); return true; } catch { return false; }
}

export function needsBackup(repoRoot: string, maxAgeHours?: number): boolean {
  const config = loadConfig(repoRoot);
  const age = latestStateBackupAgeHours(repoRoot);
  if (age === undefined) return true;
  return age >= (maxAgeHours ?? config.backup.maxAgeHours);
}

function verifyAndTrack(repoRoot: string, sqlitePath: string): void {
  try { validateBackup(sqlitePath); markBackupVerified(sqlitePath); setFailuresCount(repoRoot, 0); }
  catch { setFailuresCount(repoRoot, failuresCount(repoRoot) + 1); }
}

export function recordBackupFailure(repoRoot: string): number {
  const next = failuresCount(repoRoot) + 1;
  setFailuresCount(repoRoot, next);
  return next;
}

export function recordBackupSuccess(repoRoot: string): void { setFailuresCount(repoRoot, 0); }

export function backupFailedCycles(repoRoot: string): number { return failuresCount(repoRoot); }

export function latestStateBackupAgeHours(repoRoot: string, resolvedDir?: string): number | undefined {
  const dir = resolvedDir ?? resolveBackupsDir(repoRoot);
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
  const metadata: Record<string, unknown> = {
    dbFile: basename(report.sqlitePath), reason, schemaVersion: SCHEMA_VERSION,
    createdAt: report.createdAt, sourceBranch: gitValue(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']),
    sourceSha: gitValue(repoRoot, ['rev-parse', 'HEAD']), sizeBytes: report.sizeBytes, sha256: report.sha256,
  };
  const terminalPacketCount = terminalPacketCountAt(report.sqlitePath);
  if (terminalPacketCount !== undefined) metadata.terminalPacketCount = terminalPacketCount;
  writeFileSync(report.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function vacuumInto(sourcePath: string, destPath: string): void {
  const db = new DatabaseSync(sourcePath);
  try { db.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`); } finally { db.close(); }
}

function rawPreRestoreBackup(repoRoot: string, retention?: number, resolvedDir?: string): BackupReport {
  const dir = resolvedDir ?? resolveBackupsDir(repoRoot);
  mkdirSync(dir, { recursive: true });
  const createdAt = now();
  const sqlitePath = join(dir, `${BACKUP_PREFIX}-${stamp(createdAt)}-pre-restore.sqlite`);
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
  verifyAndTrack(repoRoot, sqlitePath);
  trimBackups(dir, retention ?? BACKUP_RETENTION_DEFAULT);
  return report;
}

export function createStateBackup(repoRoot: string, options: BackupOptions, resolvedDir?: string): BackupReport {
  const freshLeases = freshLeaseCountDirect(dbPath(repoRoot));
  if (freshLeases > 0 && options.allowFreshLeases !== true) {
    throw new Error(`backup refused: ${freshLeases} live lease(s)`);
  }
  const dir = resolvedDir ?? resolveBackupsDir(repoRoot);
  mkdirSync(dir, { recursive: true });
  const createdAt = now();
  const stampVal = stamp(createdAt);
  const sqlitePath = join(dir, `${BACKUP_PREFIX}-${stampVal}.sqlite`);
  const metadataPath = sqlitePath.replace(/\.sqlite$/, '.json');
  const tempPath = join(dir, `.${BACKUP_PREFIX}-${stampVal}.sqlite.tmp`);
  try {
    vacuumInto(dbPath(repoRoot), tempPath);
  } catch {
    copyFileSync(dbPath(repoRoot), tempPath);
  }
  if (existsSync(sqlitePath)) rmSync(sqlitePath);
  renameSync(tempPath, sqlitePath);
  const report: BackupReport = {
    sqlitePath,
    metadataPath,
    createdAt,
    sha256: sha256(sqlitePath),
    sizeBytes: statSync(sqlitePath).size,
  };
  writeMetadata(repoRoot, report, options.reason);
  verifyAndTrack(repoRoot, sqlitePath);
  trimBackups(dir, options.retention ?? BACKUP_RETENTION_DEFAULT);
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
  if (userVersion < MIN_RESTORABLE_SCHEMA_VERSION || userVersion > SCHEMA_VERSION) {
    throw new RestoreError(`backup schema version ${userVersion} is not restorable by this build; restore a compatible backup or migrate first`);
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
  try { const buf = Buffer.alloc(16); return readSync(fd, buf, 0, 16, 0) === 16 && buf.toString('utf8', 0, 16) === 'SQLite format 3\0'; } finally { closeSync(fd); }
}

function preRestoreBackup(repoRoot: string, force: boolean, retention?: number, resolvedDir?: string): BackupReport {
  try {
    return createStateBackup(repoRoot, { reason: BACKUP_REASON.PRE_RESTORE, allowFreshLeases: force, ...(retention === undefined ? {} : { retention }) }, resolvedDir);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('backup refused:')) throw error;
    return rawPreRestoreBackup(repoRoot, retention, resolvedDir);
  }
}

export function restoreStateBackup(repoRoot: string, backupPath: string, force: boolean, retention?: number, resolvedDir?: string): RestoreReport {
  if (!existsSync(backupPath)) throw new Error(`backup file not found: ${backupPath}`);

  const liveDbPath = dbPath(repoRoot);
  const freshLeases = freshLeaseCountDirect(liveDbPath);
  if (freshLeases > 0 && !force) {
    throw new Error(`backup refused: ${freshLeases} live lease(s)`);
  }

  const dir = resolvedDir ?? resolveBackupsDir(repoRoot);

  const preRestore = isValidSQLite(liveDbPath)
    ? preRestoreBackup(repoRoot, force, retention, dir)
    : rawPreRestoreBackup(repoRoot, retention, dir);

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
