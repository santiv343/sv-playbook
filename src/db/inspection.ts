import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { numberColumn, stringColumn } from './rows.js';
import { SQLITE_INTEGRITY_OK } from './store.constants.js';

const BUSY_TIMEOUT_SQL = 'PRAGMA busy_timeout = 5000';

export function terminalPacketCountAt(dbPath: string): number | undefined {
  if (!existsSync(dbPath)) return undefined;
  let db: DatabaseSync;
  try { db = new DatabaseSync(dbPath, { readOnly: true }); } catch { return undefined; }
  try {
    db.exec(BUSY_TIMEOUT_SQL);
    const row = db.prepare("SELECT COUNT(*) AS n FROM packets WHERE status IN ('done','dropped')").get();
    return numberColumn(row, 'n');
  } catch {
    return undefined;
  } finally {
    db.close();
  }
}

export function assertSqliteIntegrity(dbPath: string): void {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec(BUSY_TIMEOUT_SQL);
    const integrity = stringColumn(db.prepare('PRAGMA integrity_check').get(), 'integrity_check');
    if (integrity !== SQLITE_INTEGRITY_OK) throw new Error(`candidate integrity_check failed: ${integrity}`);
  } finally {
    db.close();
  }
}

function isLockContention(error: unknown): boolean {
  return error instanceof Error && /locked|busy/i.test(error.message);
}

export function assertExclusiveStoreLock(dbPath: string): void {
  const probe = new DatabaseSync(dbPath);
  try {
    try {
      probe.exec('BEGIN IMMEDIATE');
    } catch (error: unknown) {
      if (isLockContention(error)) return;
      throw error;
    }
    probe.exec('ROLLBACK');
    throw new Error('exclusive lock not held: second connection acquired a write lock');
  } finally {
    probe.close();
  }
}
