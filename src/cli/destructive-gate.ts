import { appendFileSync, closeSync, existsSync, openSync, readSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIRM_DESTRUCTIVE_FLAG, DESTRUCTIVE_LOG_FILE, DONE_COUNT_SQL, EVENT_COUNT_SQL, EXIT, SESSION_ROLE_FILE } from './command.constants.js';
import { DB_FILE, SQLITE_FILE_HEADER, SVP_DIR } from '../db/store.constants.js';
import { openStore } from '../db/store.js';
import type { DestructiveCounts, Io } from './command.types.js';

export function readSessionRole(repoRoot: string): string | null {
  const f = join(repoRoot, SESSION_ROLE_FILE);
  if (!existsSync(f)) return null;
  const role = readFileSync(f, 'utf8').trim().split('\n')[0];
  return role !== undefined && role !== '' ? role : null;
}

function fileIsSQLite(path: string): boolean {
  if (!existsSync(path)) return false;
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    return readSync(fd, buf, 0, 16, 0) === 16 && buf.toString('utf8', 0, 16) === SQLITE_FILE_HEADER;
  } finally {
    closeSync(fd);
  }
}

export function queryDestructiveCounts(repoRoot: string): DestructiveCounts {
  const dbPath = join(repoRoot, SVP_DIR, DB_FILE);
  if (!fileIsSQLite(dbPath)) return { done: 0, events: 0 };
  try {
    const store = openStore(repoRoot);
    try {
      const done = store.db.prepare(DONE_COUNT_SQL).get();
      const events = store.db.prepare(EVENT_COUNT_SQL).get();
      const cntA = countValue(done);
      const cntB = countValue(events);
      return { done: cntA, events: cntB };
    } finally {
      store.close();
    }
  } catch {
    return { done: 0, events: 0 };
  }
}

function countValue(row: unknown): number {
  return row !== undefined && row !== null && typeof row === 'object' && 'cnt' in row ? Number(row.cnt) : 0;
}

function recordDestructiveEvent(repoRoot: string, detail: string): void {
  try {
    appendFileSync(join(repoRoot, DESTRUCTIVE_LOG_FILE), `${new Date().toISOString()} ${detail}\n`, 'utf8');
  } catch {
    /* best-effort */
  }
}

export function checkDestructiveGate(
  io: Io,
  commandLabel: string,
  repoRoot: string,
  hasConfirmFlag: boolean,
  counts: DestructiveCounts,
): number | undefined {
  const role = readSessionRole(repoRoot);

  if (role !== null) {
    io.err(`destructive action — agent sessions cannot execute it: record the request with \`decision ask ${commandLabel}\` and wait for human execution`);
    recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} refused — role=${role}`);
    return EXIT.GATE_FAIL;
  }

  if (!hasConfirmFlag) {
    io.err(`destructive action: ${counts.done} done packet(s), ${counts.events} event(s) would be affected`);
    io.err(`pass ${CONFIRM_DESTRUCTIVE_FLAG} to proceed`);
    recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} refused — missing confirm`);
    return EXIT.GATE_FAIL;
  }

  recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} approved — actor=unbound-human, ${counts.done} done, ${counts.events} events`);
  return undefined;
}
