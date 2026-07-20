import { execFileSync } from 'node:child_process';
import type { Store } from '../db/store.types.js';
import { EVENT_EVIDENCE, STATUS } from './service.constants.js';
import type { LeaseInfo } from './service.types.js';
import { TEXT_ENCODING } from '../platform.constants.js';
import { GIT_ARGUMENT, GIT_EXECUTABLE } from '../git.constants.js';
import { taskEvents } from './schema.constants.js';

function recordEvidence(store: Store, packetId: string, detail: string, at: string): void {
  store.orm.insert(taskEvents).values({
    sessionId: null, packetId, command: EVENT_EVIDENCE, detail, at,
  }).run();
}

// Este es uno de los 3 write-sites de EVENT_EVIDENCE citados en F-010
// (findings.md) — el camino LEGACY específicamente (ver F-007: sólo lo
// ejercitan tests, movePacket(...,'review') nunca se llama en producción).
// Nunca falla duro: si git no responde, igual registra un evento con
// "head-sha unavailable: <mensaje>" en vez de abortar la transición — la
// evidencia de fallo es en sí misma evidencia, no un motivo para bloquear
// el movimiento del packet.
export function captureLegacyReviewEvidence(
  store: Store,
  packetId: string,
  from: string,
  to: string,
  lease: LeaseInfo | undefined,
): void {
  if (from !== STATUS.ACTIVE || to !== STATUS.REVIEW || lease === undefined) return;
  const at = new Date().toISOString();
  try {
    const sha = execFileSync(GIT_EXECUTABLE, [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.HEAD], {
      cwd: lease.worktree, encoding: TEXT_ENCODING.UTF8,
    }).trim();
    const branch = execFileSync(GIT_EXECUTABLE, [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.ABBREV_REF, GIT_ARGUMENT.HEAD], {
      cwd: lease.worktree, encoding: TEXT_ENCODING.UTF8,
    }).trim();
    recordEvidence(store, packetId, `head-sha ${sha}`, at);
    recordEvidence(store, packetId, `branch ${branch}`, at);
    process.stdout.write(`evidence captured: ${sha} on ${branch}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] ?? error.message : String(error);
    recordEvidence(store, packetId, `head-sha unavailable: ${message}`, at);
  }
}
