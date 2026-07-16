import { and, desc, eq } from 'drizzle-orm';
import { canonicalJson, digest } from '../context/digest.js';
import type { Store } from '../db/store.types.js';
import { SINGLE_SIZE } from '../platform.constants.js';
import { packets, taskEvents } from '../tasks/schema.constants.js';
import { EVENT_TRANSITION, STATUS } from '../tasks/service.constants.js';
import { transact } from '../tasks/transaction.js';
import {
  PROMOTION_ERROR,
  PROMOTION_ID_PREFIX,
  PROMOTION_STATUS,
  PROMOTION_TRIGGER,
} from './promotion.constants.js';
import { PromotionError } from './promotion.errors.js';
import {
  appendState,
  candidateStatus,
  findIntegrationAttempt,
  findIntegrationOutcome,
  promotionId,
} from './promotion.repository.js';
import {
  promotionCandidates,
  promotionReceipts,
  promotionStateEvents,
  promotionTaskTransitions,
} from './promotion.schema.constants.js';
import type { PromotionDashboardItem, PromotionReceipt, CandidateIdentity } from './promotion.types.js';

function receipt(row: typeof promotionReceipts.$inferSelect): PromotionReceipt {
  return {
    id: row.id,
    candidateId: row.candidateId,
    reviewCandidateId: row.reviewCandidateId,
    taskId: row.taskId,
    candidateSha: row.candidateSha,
    targetRef: row.targetRef,
    resultSha: row.resultSha,
    reviewerRunSpecId: row.reviewerRunSpecId,
    verificationDigest: row.verificationDigest,
    createdAt: row.createdAt,
  };
}

export function findPromotionReceipt(store: Store, candidateId: string): PromotionReceipt | undefined {
  const row = store.orm.select().from(promotionReceipts)
    .where(eq(promotionReceipts.candidateId, candidateId)).get();
  return row === undefined ? undefined : receipt(row);
}

function recordTaskClosure(store: Store, candidate: CandidateIdentity, receiptId: string, createdAt: string): void {
  const update = store.orm.update(packets).set({ status: STATUS.DONE, updatedAt: createdAt }).where(and(
    eq(packets.id, candidate.taskId),
    eq(packets.status, STATUS.REVIEW),
  )).run();
  if (update.changes !== SINGLE_SIZE) {
    throw new PromotionError(
      PROMOTION_ERROR.TASK_STATE_INVALID,
      `task ${candidate.taskId} must be in ${STATUS.REVIEW}`,
    );
  }
  store.orm.insert(promotionTaskTransitions).values({
    packetId: candidate.taskId,
    fromStatus: STATUS.REVIEW,
    toStatus: STATUS.DONE,
    sessionId: null,
    at: createdAt,
  }).run();
  store.orm.insert(taskEvents).values({
    sessionId: null,
    packetId: candidate.taskId,
    command: EVENT_TRANSITION,
    detail: `${STATUS.REVIEW}->${STATUS.DONE} ${receiptId}`,
    at: createdAt,
  }).run();
}

export function closePromotedTask(
  store: Store,
  candidate: CandidateIdentity,
  targetRef: string,
  resultSha: string,
  reviewerRunSpecId: string,
  verificationDigest: string,
  controllerDigest: string,
): PromotionReceipt {
  const existing = findPromotionReceipt(store, candidate.id);
  if (existing !== undefined) return existing;
  const createdAt = new Date().toISOString();
  const result: PromotionReceipt = {
    id: promotionId(PROMOTION_ID_PREFIX.RECEIPT),
    candidateId: candidate.id,
    reviewCandidateId: candidate.reviewCandidateId,
    taskId: candidate.taskId,
    candidateSha: candidate.candidateSha,
    targetRef,
    resultSha,
    reviewerRunSpecId,
    verificationDigest,
    createdAt,
  };
  transact(store, () => {
    if (candidateStatus(store, candidate.id) !== PROMOTION_STATUS.INTEGRATED) {
      throw new PromotionError(PROMOTION_ERROR.INVALID_STATE, 'candidate is not integrated');
    }
    recordTaskClosure(store, candidate, result.id, createdAt);
    store.orm.insert(promotionReceipts).values({
      ...result,
      receiptJson: canonicalJson(result),
      receiptDigest: digest(result),
    }).run();
    appendState(
      store,
      candidate.id,
      PROMOTION_STATUS.INTEGRATED,
      PROMOTION_STATUS.CLOSED,
      PROMOTION_TRIGGER.TASK_CLOSED,
      null,
      controllerDigest,
      createdAt,
    );
  });
  return result;
}

export function listPromotionReceipts(store: Store): readonly PromotionReceipt[] {
  return store.orm.select().from(promotionReceipts).orderBy(desc(promotionReceipts.createdAt)).all().map(receipt);
}

interface LatestCandidateState {
  readonly status: PromotionDashboardItem['status'];
  readonly createdAt: string;
}

function latestState(store: Store, candidateId: string): LatestCandidateState {
  const state = store.orm.select({ status: promotionStateEvents.toStatus, createdAt: promotionStateEvents.createdAt })
    .from(promotionStateEvents).where(eq(promotionStateEvents.candidateId, candidateId))
    .orderBy(desc(promotionStateEvents.sequence)).get();
  if (state === undefined) {
    throw new PromotionError(PROMOTION_ERROR.INVALID_STATE, `candidate has no state event: ${candidateId}`);
  }
  return state;
}

function dashboardItem(
  store: Store,
  candidate: typeof promotionCandidates.$inferSelect,
): PromotionDashboardItem {
  const state = latestState(store, candidate.id);
  const integrationAttempt = findIntegrationAttempt(store, candidate.id);
  const integrationOutcome = integrationAttempt === undefined
    ? undefined
    : findIntegrationOutcome(store, integrationAttempt.id);
  const completed = findPromotionReceipt(store, candidate.id);
  return {
    candidateId: candidate.id,
    reviewCandidateId: candidate.reviewCandidateId,
    taskId: candidate.taskId,
    candidateSha: candidate.candidateSha,
    status: state.status,
    targetRef: integrationAttempt?.targetRef ?? null,
    integrationOutcome: integrationOutcome?.outcome ?? null,
    receiptId: completed?.id ?? null,
    updatedAt: completed?.createdAt ?? state.createdAt,
  };
}

export function readPromotionDashboard(store: Store): readonly PromotionDashboardItem[] {
  return store.orm.select().from(promotionCandidates).orderBy(desc(promotionCandidates.createdAt)).all()
    .map((candidate) => dashboardItem(store, candidate));
}
