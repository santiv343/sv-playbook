import type { Store } from '../db/store.types.js';
import { assembleReviewCandidate, reviewCandidateRequired } from '../review/review-candidate.js';
import { runSourceWorktreeVerifyCheck } from '../review/preflight.js';
import { PREFLIGHT_STATUS } from '../review/preflight.types.js';
import { captureLegacyReviewEvidence } from './legacy-review-evidence.js';
import { STATUS } from './service.constants.js';
import { LifecycleError } from './service.errors.js';
import {
  assertLeaseForActive,
  leaseOf,
  persistMove,
  validateMove,
} from './service.js';
import { currentPacketStatus } from './dependencies.js';
import { loadWorkDefinition } from './work-definitions.js';
import type { PreparedReviewCandidate, ReviewMoveResult } from './service.types.js';

async function prepareReviewCandidate(
  store: Store,
  packetId: string,
  from: string,
): Promise<PreparedReviewCandidate | undefined> {
  if (from !== STATUS.ACTIVE || !reviewCandidateRequired(store, STATUS.REVIEW)) return undefined;
  const definition = loadWorkDefinition(store, packetId);
  const lease = leaseOf(store, packetId);
  return lease === undefined
    ? undefined
    : { definition, candidate: await assembleReviewCandidate(store, definition, lease) };
}

async function verifyLegacyReview(store: Store, packetId: string, from: string): Promise<void> {
  const lease = leaseOf(store, packetId);
  if (lease !== undefined) {
    const verify = await runSourceWorktreeVerifyCheck(lease.worktree);
    if (verify.status === PREFLIGHT_STATUS.FAIL || verify.status === PREFLIGHT_STATUS.UNKNOWN) {
      throw new LifecycleError(`verify command failed: ${verify.detail}`);
    }
  }
  captureLegacyReviewEvidence(store, packetId, from, STATUS.REVIEW, lease);
}

// Éste, no movePacket() (service.ts), es el camino que REALMENTE ejecuta
// `task move <id> review` (ver src/cli/commands/task.ts, handleMove) — el
// branch REVIEW-específico dentro de movePacket() (gateVerify,
// captureLegacyReviewEvidence) queda inalcanzable desde el CLI real, sólo
// lo ejercitan tests que llaman movePacket() directo (ver findings.md
// F-007).
export async function movePacketToReview(
  store: Store,
  sessionId: string | undefined,
  packetId: string,
): Promise<ReviewMoveResult> {
  const from = validateMove(store, sessionId, packetId, STATUS.REVIEW);
  const prepared = await prepareReviewCandidate(store, packetId, from);
  if (prepared === undefined) await verifyLegacyReview(store, packetId, from);
  if (currentPacketStatus(store, packetId) !== from) {
    throw new LifecycleError('task state changed while review evidence was being prepared');
  }
  assertLeaseForActive(store, sessionId, packetId);
  persistMove(store, sessionId, packetId, from, STATUS.REVIEW, prepared);
  return { from, integration: prepared?.candidate.value.candidate.integration };
}
