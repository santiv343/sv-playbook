import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { DATABASE_COLUMN } from '../db/schema-vocabulary.constants.js';
import { TRANSITION_COLUMN } from '../tasks/service.constants.js';
import type { IntegrationOutcome, PromotionStatus, PromotionVerdict } from './promotion.types.js';

export const PROMOTION_TABLE = {
  CANDIDATES: 'promotion_candidates',
  STATE_EVENTS: 'promotion_state_events',
  CHECK_RECEIPTS: 'promotion_check_receipts',
  REVIEW_VERDICTS: 'promotion_review_verdicts',
  INTEGRATION_ATTEMPTS: 'promotion_integration_attempts',
  INTEGRATION_OUTCOMES: 'promotion_integration_outcomes',
  RECEIPTS: 'promotion_receipts',
} as const;

const COLUMN = {
  ATTEMPT_ID: 'attempt_id',
  CANDIDATE_ID: 'candidate_id',
  CANDIDATE_SHA: 'candidate_sha',
  REASON: 'reason',
  RECEIPT_DIGEST: 'receipt_digest',
  RESULT_SHA: 'result_sha',
  REVIEW_CANDIDATE_ID: 'review_candidate_id',
  REVIEWER_RUN_SPEC_ID: 'reviewer_run_spec_id',
  TARGET_REF: 'target_ref',
  TASK_ID: 'task_id',
  WORK_DEFINITION_DIGEST: 'work_definition_digest',
} as const;

export const promotionCandidates = sqliteTable(PROMOTION_TABLE.CANDIDATES, {
  id: text(COLUMN.CANDIDATE_ID).primaryKey(),
  reviewCandidateId: text(COLUMN.REVIEW_CANDIDATE_ID).notNull().unique(),
  taskId: text(COLUMN.TASK_ID).notNull(),
  workDefinitionVersion: integer('work_definition_version').notNull(),
  workDefinitionDigest: text(COLUMN.WORK_DEFINITION_DIGEST).notNull(),
  baseSha: text('base_sha').notNull(),
  candidateSha: text(COLUMN.CANDIDATE_SHA).notNull(),
  configDigest: text('config_digest').notNull(),
  contractDigest: text('contract_digest').notNull(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
}, (table) => [uniqueIndex('promotion_candidate_identity').on(
  table.taskId,
  table.workDefinitionVersion,
  table.candidateSha,
  table.configDigest,
  table.contractDigest,
)]);

export const promotionStateEvents = sqliteTable(PROMOTION_TABLE.STATE_EVENTS, {
  id: text('event_id').primaryKey(),
  candidateId: text(COLUMN.CANDIDATE_ID).notNull(),
  sequence: integer('sequence').notNull(),
  fromStatus: text(TRANSITION_COLUMN.FROM_STATUS).$type<PromotionStatus>(),
  toStatus: text(TRANSITION_COLUMN.TO_STATUS).$type<PromotionStatus>().notNull(),
  trigger: text('trigger').notNull(),
  reason: text(COLUMN.REASON),
  controllerDigest: text('controller_digest').notNull(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
}, (table) => [
  uniqueIndex('promotion_state_event_sequence').on(table.candidateId, table.sequence),
  index('promotion_state_event_candidate').on(table.candidateId, table.sequence),
]);

export const promotionCheckReceipts = sqliteTable(PROMOTION_TABLE.CHECK_RECEIPTS, {
  id: text('check_receipt_id').primaryKey(),
  candidateId: text(COLUMN.CANDIDATE_ID).notNull(),
  kind: text(DATABASE_COLUMN.KIND).notNull(),
  status: text('status').notNull(),
  candidateSha: text(COLUMN.CANDIDATE_SHA).notNull(),
  receiptJson: text(DATABASE_COLUMN.RECEIPT_JSON).notNull(),
  receiptDigest: text(COLUMN.RECEIPT_DIGEST).notNull(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
}, (table) => [index('promotion_check_candidate').on(table.candidateId, table.kind)]);

export const promotionReviewVerdicts = sqliteTable(PROMOTION_TABLE.REVIEW_VERDICTS, {
  id: text('verdict_id').primaryKey(),
  candidateId: text(COLUMN.CANDIDATE_ID).notNull(),
  reviewerRunSpecId: text(COLUMN.REVIEWER_RUN_SPEC_ID).notNull().unique(),
  reviewerSessionId: text('reviewer_session_id').notNull(),
  verdict: text('verdict').$type<PromotionVerdict>().notNull(),
  outputDigest: text('output_digest').notNull(),
  candidateSha: text(COLUMN.CANDIDATE_SHA).notNull(),
  workDefinitionDigest: text(COLUMN.WORK_DEFINITION_DIGEST).notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
}, (table) => [uniqueIndex('promotion_verdict_candidate').on(table.candidateId)]);

export const promotionIntegrationAttempts = sqliteTable(PROMOTION_TABLE.INTEGRATION_ATTEMPTS, {
  id: text(COLUMN.ATTEMPT_ID).primaryKey(),
  candidateId: text(COLUMN.CANDIDATE_ID).notNull(),
  effectKey: text('effect_key').notNull().unique(),
  targetRef: text(COLUMN.TARGET_REF).notNull(),
  beforeSha: text('before_sha').notNull(),
  candidateSha: text(COLUMN.CANDIDATE_SHA).notNull(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
}, (table) => [uniqueIndex('promotion_attempt_candidate').on(table.candidateId)]);

export const promotionIntegrationOutcomes = sqliteTable(PROMOTION_TABLE.INTEGRATION_OUTCOMES, {
  id: text('outcome_id').primaryKey(),
  attemptId: text(COLUMN.ATTEMPT_ID).notNull().unique(),
  candidateId: text(COLUMN.CANDIDATE_ID).notNull(),
  outcome: text('outcome').$type<IntegrationOutcome>().notNull(),
  resultSha: text(COLUMN.RESULT_SHA),
  reason: text(COLUMN.REASON),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
});

export const promotionReceipts = sqliteTable(PROMOTION_TABLE.RECEIPTS, {
  id: text('receipt_id').primaryKey(),
  candidateId: text(COLUMN.CANDIDATE_ID).notNull().unique(),
  reviewCandidateId: text(COLUMN.REVIEW_CANDIDATE_ID).notNull(),
  taskId: text(COLUMN.TASK_ID).notNull(),
  candidateSha: text(COLUMN.CANDIDATE_SHA).notNull(),
  targetRef: text(COLUMN.TARGET_REF).notNull(),
  resultSha: text(COLUMN.RESULT_SHA).notNull(),
  reviewerRunSpecId: text(COLUMN.REVIEWER_RUN_SPEC_ID).notNull(),
  verificationDigest: text('verification_digest').notNull(),
  receiptJson: text(DATABASE_COLUMN.RECEIPT_JSON).notNull(),
  receiptDigest: text(COLUMN.RECEIPT_DIGEST).notNull(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
});

export const promotionTaskTransitions = sqliteTable('transitions', {
  sequence: integer('seq').primaryKey({ autoIncrement: true }),
  packetId: text('packet_id').notNull(),
  fromStatus: text(TRANSITION_COLUMN.FROM_STATUS).notNull(),
  toStatus: text(TRANSITION_COLUMN.TO_STATUS).notNull(),
  sessionId: text(DATABASE_COLUMN.SESSION_ID),
  at: text(TRANSITION_COLUMN.AT).notNull(),
});

export const promotionSchema = {
  promotionCandidates,
  promotionStateEvents,
  promotionCheckReceipts,
  promotionReviewVerdicts,
  promotionIntegrationAttempts,
  promotionIntegrationOutcomes,
  promotionReceipts,
  promotionTaskTransitions,
};
