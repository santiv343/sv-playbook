import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { numberColumn, stringColumn } from './rows.js';

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
    if (integrity !== 'ok') throw new Error(`candidate integrity_check failed: ${integrity}`);
  } finally {
    db.close();
  }
}
