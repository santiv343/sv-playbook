import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { numberColumn, stringColumn } from './rows.js';
import { NODE_EVAL_FLAG, PROCESS_STDIO, TEXT_ENCODING } from '../platform.constants.js';
import { SQLITE_INTEGRITY_OK } from './store.constants.js';

const BUSY_TIMEOUT_SQL = 'PRAGMA busy_timeout = 5000';
const BEGIN_IMMEDIATE_SQL = 'BEGIN IMMEDIATE';
const ROLLBACK_SQL = 'ROLLBACK';
const LOCK_PROBE_TIMEOUT_MS = 10_000;

// Exit protocol of the lock-probe child process.
const LOCK_PROBE_EXIT = {
  HELD: 0,
  ERROR: 1,
  ACQUIRED: 2,
} as const;

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

// POSIX fcntl locks are per-process, so a probe connection opened in-process
// always "acquires" the lock the holder already has and the check fails on
// Linux/macOS. The probe runs in a child process, where the exclusive hold
// genuinely conflicts on every platform.
function buildLockProbeScript(dbPath: string): string {
  return `const{DatabaseSync}=require('node:sqlite');const busy=/locked|busy/i;const db=new DatabaseSync(${JSON.stringify(dbPath)});let code=${LOCK_PROBE_EXIT.ERROR};try{db.exec(${JSON.stringify(BEGIN_IMMEDIATE_SQL)});db.exec(${JSON.stringify(ROLLBACK_SQL)});code=${LOCK_PROBE_EXIT.ACQUIRED};}catch(error){if(busy.test(String(error&&error.message)))code=${LOCK_PROBE_EXIT.HELD};}finally{db.close();}process.exit(code);`;
}

// Usado por el daemon al arrancar (flujo 6) para confirmar que REALMENTE
// tiene el lock exclusivo, no sólo que better-sqlite3 no tiró error. La
// sonda corre en un CHILD PROCESS a propósito: los locks fcntl de POSIX
// son por-proceso, así que una conexión de sondeo abierta en el MISMO
// proceso que ya tiene el lock lo "adquiriría" sin problema (fcntl no se
// bloquea a sí mismo) y el chequeo daría un falso negativo en Linux/macOS
// — en un proceso hijo separado, el conflicto es real en cualquier
// plataforma.
export function assertExclusiveStoreLock(dbPath: string): void {
  const result = spawnSync(process.execPath, [NODE_EVAL_FLAG, buildLockProbeScript(dbPath)], {
    encoding: TEXT_ENCODING.UTF8,
    stdio: [PROCESS_STDIO.IGNORE, PROCESS_STDIO.IGNORE, PROCESS_STDIO.PIPE],
    timeout: LOCK_PROBE_TIMEOUT_MS,
  });
  if (result.status === LOCK_PROBE_EXIT.HELD) return;
  if (result.status === LOCK_PROBE_EXIT.ACQUIRED) {
    throw new Error('exclusive lock not held: second connection acquired a write lock');
  }
  const detail = result.stderr.trim();
  throw new Error(detail ? `lock probe failed: ${detail}` : 'lock probe failed');
}
