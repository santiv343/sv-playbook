import type { Store } from '../db/store.types.js';
import {
  INTEGRATION_OUTCOME,
  PROMOTION_ERROR,
  PROMOTION_STATUS,
  PROMOTION_TRIGGER,
} from './promotion.constants.js';
import { PromotionError } from './promotion.errors.js';
import {
  candidateStatus,
  findIntegrationAttempt,
  findIntegrationOutcome,
  recordIntegrationIntent,
  recordIntegrationOutcome,
  transitionCandidate,
} from './promotion.repository.js';
import type {
  CandidateIdentity,
  GitPromotionPort,
  IntegrationObservation,
  PromotionStatus,
  StoredIntegrationAttempt,
} from './promotion.types.js';

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function transitionIf(
  store: Store,
  candidateId: string,
  expected: PromotionStatus,
  target: PromotionStatus,
  trigger: string,
  runtimeDigest: string,
  reason: string | null = null,
): void {
  const current = candidateStatus(store, candidateId);
  if (current === target) return;
  transitionCandidate(store, candidateId, expected, target, trigger, runtimeDigest, reason);
}

// El efecto real (fastForwardRef, un git update-ref condicional — el mismo
// compare-and-swap documentado en architecture.md) puede fallar SIN que eso
// sea el veredicto final: después de intentarlo (o de saltarlo porque
// beforeEffect ya no matchea), se OBSERVA el estado real del ref y se
// deriva el outcome de ahí — SUCCEEDED si avanzó al candidateSha esperado,
// FAILED si se quedó en beforeSha, UNKNOWN si divergió a otra cosa. Esto
// hace que la operación sea segura de reintentar: si el proceso murió justo
// después del update-ref pero antes de registrar el resultado, la próxima
// corrida observa la realidad en vez de asumir que falló.
function integrationObservation(
  git: GitPromotionPort,
  repoRoot: string,
  attempt: StoredIntegrationAttempt,
): IntegrationObservation {
  let effectError: string | null = null;
  const beforeEffect = git.refSha(repoRoot, attempt.targetRef);
  if (beforeEffect === attempt.beforeSha) {
    try {
      git.fastForwardRef(repoRoot, attempt.targetRef, attempt.beforeSha, attempt.candidateSha);
    } catch (error: unknown) {
      effectError = errorDetail(error);
    }
  }
  let observed: string;
  try {
    observed = git.refSha(repoRoot, attempt.targetRef);
  } catch (error: unknown) {
    return {
      outcome: INTEGRATION_OUTCOME.UNKNOWN,
      resultSha: null,
      reason: `cannot observe integration target: ${errorDetail(error)}`,
    };
  }
  if (observed === attempt.candidateSha) {
    return { outcome: INTEGRATION_OUTCOME.SUCCEEDED, resultSha: observed, reason: null };
  }
  if (observed === attempt.beforeSha) {
    return {
      outcome: INTEGRATION_OUTCOME.FAILED,
      resultSha: observed,
      reason: effectError ?? 'target ref did not advance',
    };
  }
  return {
    outcome: INTEGRATION_OUTCOME.UNKNOWN,
    resultSha: observed,
    reason: `target ref diverged to ${observed}`,
  };
}

function outcomeOrExecute(
  store: Store,
  git: GitPromotionPort,
  repoRoot: string,
  attempt: StoredIntegrationAttempt,
): IntegrationObservation {
  const existing = findIntegrationOutcome(store, attempt.id);
  if (existing !== undefined) return existing;
  const observed = integrationObservation(git, repoRoot, attempt);
  recordIntegrationOutcome(store, attempt, observed);
  return observed;
}

function requireSuccessfulIntegration(
  store: Store,
  candidate: CandidateIdentity,
  observation: IntegrationObservation,
  runtimeDigest: string,
): string {
  if (observation.outcome === INTEGRATION_OUTCOME.SUCCEEDED && observation.resultSha !== null) {
    transitionIf(
      store,
      candidate.id,
      PROMOTION_STATUS.INTEGRATION_PENDING,
      PROMOTION_STATUS.INTEGRATED,
      PROMOTION_TRIGGER.INTEGRATION_SUCCEEDED,
      runtimeDigest,
    );
    return observation.resultSha;
  }
  const trigger = observation.outcome === INTEGRATION_OUTCOME.UNKNOWN
    ? PROMOTION_TRIGGER.INTEGRATION_UNKNOWN
    : PROMOTION_TRIGGER.INTEGRATION_FAILED;
  transitionIf(
    store,
    candidate.id,
    PROMOTION_STATUS.INTEGRATION_PENDING,
    PROMOTION_STATUS.BLOCKED,
    trigger,
    runtimeDigest,
    observation.reason,
  );
  const code = observation.outcome === INTEGRATION_OUTCOME.UNKNOWN
    ? PROMOTION_ERROR.INTEGRATION_UNKNOWN
    : PROMOTION_ERROR.INTEGRATION_FAILED;
  throw new PromotionError(code, observation.reason ?? 'integration did not succeed');
}

function integratedResultSha(store: Store, candidate: CandidateIdentity): string {
  const attempt = findIntegrationAttempt(store, candidate.id);
  const outcome = attempt === undefined ? undefined : findIntegrationOutcome(store, attempt.id);
  if (outcome?.outcome === INTEGRATION_OUTCOME.SUCCEEDED && outcome.resultSha !== null) return outcome.resultSha;
  throw new PromotionError(PROMOTION_ERROR.INTEGRATION_UNKNOWN, 'integrated candidate lacks a success outcome');
}

function ensureIntegrationAttempt(
  store: Store,
  git: GitPromotionPort,
  repoRoot: string,
  candidate: CandidateIdentity,
  targetRef: string,
): StoredIntegrationAttempt {
  let attempt = findIntegrationAttempt(store, candidate.id);
  if (attempt === undefined) {
    const beforeSha = git.refSha(repoRoot, targetRef);
    if (beforeSha !== candidate.baseSha || !git.isAncestor(repoRoot, beforeSha, candidate.candidateSha)) {
      throw new PromotionError(PROMOTION_ERROR.TARGET_STALE, 'target ref no longer matches the candidate base');
    }
    attempt = recordIntegrationIntent(store, candidate, targetRef, beforeSha);
  }
  if (attempt.targetRef !== targetRef || attempt.candidateSha !== candidate.candidateSha) {
    throw new PromotionError(PROMOTION_ERROR.CANDIDATE_STALE, 'persisted integration intent has different inputs');
  }
  return attempt;
}

export function integrateCandidate(
  store: Store,
  git: GitPromotionPort,
  repoRoot: string,
  candidate: CandidateIdentity,
  targetRef: string,
  runtimeDigest: string,
): string {
  const status = candidateStatus(store, candidate.id);
  if (status !== PROMOTION_STATUS.APPROVED && status !== PROMOTION_STATUS.INTEGRATION_PENDING
    && status !== PROMOTION_STATUS.INTEGRATED) {
    throw new PromotionError(PROMOTION_ERROR.INVALID_STATE, `candidate cannot integrate from ${status}`);
  }
  if (status === PROMOTION_STATUS.INTEGRATED) return integratedResultSha(store, candidate);
  const attempt = ensureIntegrationAttempt(store, git, repoRoot, candidate, targetRef);
  transitionIf(
    store,
    candidate.id,
    PROMOTION_STATUS.APPROVED,
    PROMOTION_STATUS.INTEGRATION_PENDING,
    PROMOTION_TRIGGER.INTEGRATION_STARTED,
    runtimeDigest,
  );
  return requireSuccessfulIntegration(
    store,
    candidate,
    outcomeOrExecute(store, git, repoRoot, attempt),
    runtimeDigest,
  );
}
