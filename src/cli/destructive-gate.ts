import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESTRUCTIVE_LOG_FILE, DONE_COUNT_SQL, EVENT_COUNT_SQL, EXIT, SESSION_ROLE_FILE } from './command.constants.js';
import { openStore } from '../db/store.js';
import type { DestructiveCounts, Io } from './command.types.js';

export function readSessionRole(repoRoot: string): string | null {
  const f = join(repoRoot, SESSION_ROLE_FILE);
  if (!existsSync(f)) return null;
  const role = readFileSync(f, 'utf8').trim().split('\n')[0];
  return role !== undefined && role !== '' ? role : null;
}

export function queryDestructiveCounts(repoRoot: string): DestructiveCounts {
  try {
    const store = openStore(repoRoot);
    try {
      const done = store.db.prepare(DONE_COUNT_SQL).get();
      const events = store.db.prepare(EVENT_COUNT_SQL).get();
      const cntA = done !== undefined && typeof done === 'object' && 'cnt' in done ? Number(done.cnt) : 0;
      const cntB = events !== undefined && typeof events === 'object' && 'cnt' in events ? Number(events.cnt) : 0;
      return { done: cntA, events: cntB };
    } finally {
      store.close();
    }
  } catch {
    return { done: 0, events: 0 };
  }
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

  if (role !== null && role !== 'founder') {
    io.err(`destructive action — requires founder-interface approval: record the request with \`decision ask ${commandLabel}\` and wait`);
    recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} refused — role=${role}`);
    return EXIT.GATE_FAIL;
  }

  if (!hasConfirmFlag) {
    io.err(`destructive action: ${counts.done} done packet(s), ${counts.events} event(s) would be affected`);
    io.err('pass --confirm-destructive to proceed');
    recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} refused — missing confirm`);
    return EXIT.GATE_FAIL;
  }

  recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} approved — role=${role ?? 'none'}, ${counts.done} done, ${counts.events} events`);
  return undefined;
}
