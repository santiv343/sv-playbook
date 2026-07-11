import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import { stringColumn } from '../db/rows.js';
import { EVENT_DESTRUCTIVE, INSERT_EVENT_SQL, SESSION_FILE_NAME } from '../tasks/service.constants.js';
import { DONE_COUNT_SQL, EVENT_COUNT_SQL, EXIT } from './command.constants.js';
import type { Io } from './command.types.js';

export interface DestructiveCounts {
  done: number;
  events: number;
}

export function readSessionRole(repoRoot: string): string | null {
  const sessionFile = join(repoRoot, SESSION_FILE_NAME);
  if (!existsSync(sessionFile)) return null;
  const sessionId = readFileSync(sessionFile, 'utf8').trim().split('\n')[0] ?? null;
  if (sessionId === null) return null;

  try {
    const store = openStore(repoRoot);
    try {
      const row = store.db.prepare('SELECT role FROM sessions WHERE id = ?').get(sessionId);
      if (row === undefined) return null;
      const role = stringColumn(row, 'role');
      return role !== '' ? role : null;
    } finally {
      store.close();
    }
  } catch {
    return null;
  }
}

export function setSessionRole(repoRoot: string, sessionId: string, role: string): void {
  const store = openStore(repoRoot);
  try {
    store.db.prepare('UPDATE sessions SET role = ? WHERE id = ?').run(role, sessionId);
  } finally {
    store.close();
  }
}

export function queryDestructiveCounts(repoRoot: string): DestructiveCounts {
  try {
    const store = openStore(repoRoot);
    try {
      const done = store.db.prepare(DONE_COUNT_SQL).get();
      const events = store.db.prepare(EVENT_COUNT_SQL).get();
      const d = done !== undefined ? (done as Record<string, unknown>).cnt : 0;
      const e = events !== undefined ? (events as Record<string, unknown>).cnt : 0;
      return { done: typeof d === 'number' ? d : 0, events: typeof e === 'number' ? e : 0 };
    } finally {
      store.close();
    }
  } catch {
    return { done: 0, events: 0 };
  }
}

function recordDestructiveEvent(repoRoot: string, detail: string): void {
  try {
    const sessionFile = join(repoRoot, SESSION_FILE_NAME);
    const sessionId = existsSync(sessionFile) ? readFileSync(sessionFile, 'utf8').trim().split('\n')[0] ?? null : null;
    const store = openStore(repoRoot);
    try {
      store.db.prepare(INSERT_EVENT_SQL).run(sessionId, null, EVENT_DESTRUCTIVE, detail, new Date().toISOString());
    } finally {
      store.close();
    }
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
): Promise<number> | undefined {
  const role = readSessionRole(repoRoot);

  if (role !== null && role !== 'founder') {
    io.err(`destructive action — requires founder-interface approval: record the request with \`decision ask ${commandLabel}\` and wait`);
    recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} refused — role=${role}`);
    return Promise.resolve(EXIT.GATE_FAIL);
  }

  if (!hasConfirmFlag) {
    io.err(`destructive action: ${counts.done} done packet(s), ${counts.events} event(s) would be affected`);
    io.err('pass --confirm-destructive to proceed');
    recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} refused — missing confirm`);
    return Promise.resolve(EXIT.GATE_FAIL);
  }

  recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} approved — role=${role ?? 'none'}, ${counts.done} done, ${counts.events} events`);
  return undefined;
}
