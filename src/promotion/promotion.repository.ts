import { desc, eq, max } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { canonicalJson, digest } from '../context/digest.js';
import type { Store } from '../db/store.types.js';
import { workflowArtifacts } from '../orchestration/schema.constants.js';
import { reviewCandidates } from '../review/schema.constants.js';
import { transact } from '../tasks/transaction.js';
import {
  PROMOTION_ERROR,
  PROMOTION_ID_PREFIX,
  PROMOTION_STATUS,
  PROMOTION_TRIGGER,
} from './promotion.constants.js';
import { PromotionError } from './promotion.errors.js';
import { parseReviewCandidateArtifact } from './promotion.parsers.js';
import {
  promotionCandidates,
  promotionCheckReceipts,
  promotionIntegrationAttempts,
  promotionIntegrationOutcomes,
  promotionReviewVerdicts,
  promotionStateEvents,
} from './promotion.schema.constants.js';
import type {
  CandidateEvidence,
  CandidateIdentity,
  IntegrationObservation,
  PromotionStatus,
  StoredIntegrationAttempt,
  ValidatedReviewVerdict,
} from './promotion.types.js';

interface CandidateCreation {
  readonly reviewCandidateId: string;
  readonly configDigest: string;
  readonly contractDigest: string;
}

export function promotionId(prefix: string): string {
  return `${prefix}${uuidv7()}`;
}

function candidateIdentity(row: typeof promotionCandidates.$inferSelect): CandidateIdentity {
  return {
    id: row.id,
    reviewCandidateId: row.reviewCandidateId,
    taskId: row.taskId,
    workDefinitionVersion: row.workDefinitionVersion,
    workDefinitionDigest: row.workDefinitionDigest,
    baseSha: row.baseSha,
    candidateSha: row.candidateSha,
    configDigest: row.configDigest,
    contractDigest: row.contractDigest,
    createdAt: row.createdAt,
  };
}

export function appendState(
  store: Store,
  candidateId: string,
  fromStatus: PromotionStatus | null,
  toStatus: PromotionStatus,
  trigger: string,
  reason: string | null,
  controllerDigest: string,
  createdAt: string,
): void {
  const latest = store.orm.select({ sequence: max(promotionStateEvents.sequence) })
    .from(promotionStateEvents).where(eq(promotionStateEvents.candidateId, candidateId)).get();
  store.orm.insert(promotionStateEvents).values({
    id: promotionId(PROMOTION_ID_PREFIX.EVENT),
    candidateId,
    sequence: (latest?.sequence ?? 0) + 1,
    fromStatus,
    toStatus,
    trigger,
    reason,
    controllerDigest,
    createdAt,
  }).run();
}

export function loadCandidateEvidence(store: Store, reviewCandidateId: string): CandidateEvidence {
  const row = store.orm.select({
    reviewCandidateId: reviewCandidates.id,
    artifactId: reviewCandidates.artifactId,
    artifactDigest: workflowArtifacts.valueDigest,
    valueJson: workflowArtifacts.valueJson,
  }).from(reviewCandidates)
    .innerJoin(workflowArtifacts, eq(workflowArtifacts.id, reviewCandidates.artifactId))
    .where(eq(reviewCandidates.id, reviewCandidateId)).get();
  if (row === undefined) {
    throw new PromotionError(PROMOTION_ERROR.CANDIDATE_NOT_FOUND, `review candidate not found: ${reviewCandidateId}`);
  }
  const value = parseReviewCandidateArtifact(row.valueJson);
  const existing = store.orm.select().from(promotionCandidates)
    .where(eq(promotionCandidates.reviewCandidateId, reviewCandidateId)).get();
  const identity: CandidateIdentity = existing === undefined ? {
    id: '',
    reviewCandidateId,
    taskId: value.taskId,
    workDefinitionVersion: value.workDefinitionVersion,
    workDefinitionDigest: value.workDefinitionDigest,
    baseSha: value.baseSha,
    candidateSha: value.candidateSha,
    configDigest: '',
    contractDigest: '',
    createdAt: '',
  } : candidateIdentity(existing);
  return {
    identity,
    artifactId: row.artifactId,
    artifactDigest: row.artifactDigest,
    producerSessionId: value.producerSessionId,
    changedFiles: value.changedFiles,
    integration: value.integration,
    preflightOverall: value.preflightOverall,
    cleanVerificationCandidateSha: value.cleanVerificationCandidateSha,
    cleanVerificationStatus: value.cleanVerificationStatus,
  };
}

export function ensurePromotionCandidate(
  store: Store,
  evidence: CandidateEvidence,
  creation: CandidateCreation,
  controllerDigest: string,
): CandidateIdentity {
  const existing = store.orm.select().from(promotionCandidates)
    .where(eq(promotionCandidates.reviewCandidateId, creation.reviewCandidateId)).get();
  if (existing !== undefined) return candidateIdentity(existing);
  const now = new Date().toISOString();
  const candidate: CandidateIdentity = {
    ...evidence.identity,
    id: promotionId(PROMOTION_ID_PREFIX.CANDIDATE),
    configDigest: creation.configDigest,
    contractDigest: creation.contractDigest,
    createdAt: now,
  };
  transact(store, () => {
    store.orm.insert(promotionCandidates).values(candidate).run();
    appendState(
      store,
      candidate.id,
      null,
      PROMOTION_STATUS.CREATED,
      PROMOTION_TRIGGER.CANDIDATE_CREATED,
      null,
      controllerDigest,
      now,
    );
  });
  return candidate;
}

export function candidateStatus(store: Store, candidateId: string): PromotionStatus {
  const row = store.orm.select({ status: promotionStateEvents.toStatus })
    .from(promotionStateEvents).where(eq(promotionStateEvents.candidateId, candidateId))
    .orderBy(desc(promotionStateEvents.sequence)).get();
  if (row === undefined) {
    throw new PromotionError(PROMOTION_ERROR.CANDIDATE_NOT_FOUND, `promotion candidate not found: ${candidateId}`);
  }
  return row.status;
}

export function transitionCandidate(
  store: Store,
  candidateId: string,
  expected: PromotionStatus,
  target: PromotionStatus,
  trigger: string,
  controllerDigest: string,
  reason: string | null = null,
): void {
  const current = candidateStatus(store, candidateId);
  if (current === target) return;
  if (current !== expected) {
    throw new PromotionError(
      PROMOTION_ERROR.INVALID_STATE,
      `candidate ${candidateId} is ${current}; expected ${expected}`,
    );
  }
  appendState(store, candidateId, current, target, trigger, reason, controllerDigest, new Date().toISOString());
}

export function recordCheckReceipt(
  store: Store,
  candidateId: string,
  kind: string,
  status: string,
  candidateSha: string,
  receipt: unknown,
): string {
  const receiptJson = canonicalJson(receipt);
  const receiptDigest = digest(receipt);
  store.orm.insert(promotionCheckReceipts).values({
    id: promotionId(PROMOTION_ID_PREFIX.CHECK),
    candidateId,
    kind,
    status,
    candidateSha,
    receiptJson,
    receiptDigest,
    createdAt: new Date().toISOString(),
  }).run();
  return receiptDigest;
}

export function recordValidatedVerdict(
  store: Store,
  candidate: CandidateIdentity,
  verdict: ValidatedReviewVerdict,
): void {
  const existing = store.orm.select().from(promotionReviewVerdicts)
    .where(eq(promotionReviewVerdicts.candidateId, candidate.id)).get();
  if (existing !== undefined) {
    if (existing.reviewerRunSpecId !== verdict.runSpecId || existing.outputDigest !== verdict.outputDigest) {
      throw new PromotionError(PROMOTION_ERROR.REVIEW_INVALID, 'candidate already has a different review verdict');
    }
    return;
  }
  store.orm.insert(promotionReviewVerdicts).values({
    id: promotionId(PROMOTION_ID_PREFIX.VERDICT),
    candidateId: candidate.id,
    reviewerRunSpecId: verdict.runSpecId,
    reviewerSessionId: verdict.reviewerSessionId,
    verdict: verdict.verdict,
    outputDigest: verdict.outputDigest,
    candidateSha: candidate.candidateSha,
    workDefinitionDigest: candidate.workDefinitionDigest,
    payloadJson: verdict.payloadJson,
    createdAt: new Date().toISOString(),
  }).run();
}

function attempt(row: typeof promotionIntegrationAttempts.$inferSelect): StoredIntegrationAttempt {
  return row;
}

export function findIntegrationAttempt(store: Store, candidateId: string): StoredIntegrationAttempt | undefined {
  const row = store.orm.select().from(promotionIntegrationAttempts)
    .where(eq(promotionIntegrationAttempts.candidateId, candidateId)).get();
  return row === undefined ? undefined : attempt(row);
}

export function recordIntegrationIntent(
  store: Store,
  candidate: CandidateIdentity,
  targetRef: string,
  beforeSha: string,
): StoredIntegrationAttempt {
  const existing = findIntegrationAttempt(store, candidate.id);
  if (existing !== undefined) return existing;
  const created: StoredIntegrationAttempt = {
    id: promotionId(PROMOTION_ID_PREFIX.ATTEMPT),
    candidateId: candidate.id,
    effectKey: digest({ targetRef, beforeSha, candidateSha: candidate.candidateSha, taskId: candidate.taskId }),
    targetRef,
    beforeSha,
    candidateSha: candidate.candidateSha,
    createdAt: new Date().toISOString(),
  };
  store.orm.insert(promotionIntegrationAttempts).values(created).run();
  return created;
}

export function findIntegrationOutcome(store: Store, attemptId: string): IntegrationObservation | undefined {
  const row = store.orm.select().from(promotionIntegrationOutcomes)
    .where(eq(promotionIntegrationOutcomes.attemptId, attemptId)).get();
  if (row === undefined) return undefined;
  return { outcome: row.outcome, resultSha: row.resultSha, reason: row.reason };
}

export function recordIntegrationOutcome(
  store: Store,
  attempt: StoredIntegrationAttempt,
  observation: IntegrationObservation,
): void {
  const existing = findIntegrationOutcome(store, attempt.id);
  if (existing !== undefined) {
    if (canonicalJson(existing) !== canonicalJson(observation)) {
      throw new PromotionError(PROMOTION_ERROR.INTEGRATION_UNKNOWN, 'integration outcome is immutable');
    }
    return;
  }
  store.orm.insert(promotionIntegrationOutcomes).values({
    id: promotionId(PROMOTION_ID_PREFIX.OUTCOME),
    attemptId: attempt.id,
    candidateId: attempt.candidateId,
    outcome: observation.outcome,
    resultSha: observation.resultSha,
    reason: observation.reason,
    createdAt: new Date().toISOString(),
  }).run();
}
