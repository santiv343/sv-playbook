import { RECONCILIATION_PROPOSAL_STATUS } from '../contracts/protocol-reconciliation.constants.js';
import { GATEWAY_RUN_STATUS } from '../gateway/gateway.constants.js';
import { PREFLIGHT_STATUS } from '../review/preflight.types.js';
import { SPRINT_STATE } from '../sprints/service.constants.js';
import { STATUS } from '../tasks/service.constants.js';

// Single source: src/contracts/review-verdict.constants.ts (the wire contract).
// Re-exported here so existing promotion imports keep working.
export { REVIEW_VERDICT_KIND } from '../contracts/review-verdict.constants.js';
export {
  REVIEW_VERDICT as PROMOTION_VERDICT,
  REVIEW_VERDICT_VALUES as PROMOTION_VERDICT_VALUES,
} from '../contracts/review-verdict.constants.js';

export const PROMOTION_CONTROLLER_VERSION = 1;
export const PROMOTION_OPERATION_ID = 'promotion.execute';
export const PROMOTION_RECEIPT_KIND = 'promotion-receipt';
export const PROMOTION_ID_PREFIX = {
  CANDIDATE: 'PROM-CAND-',
  EVENT: 'PROM-EVT-',
  CHECK: 'PROM-CHK-',
  VERDICT: 'PROM-VER-',
  ATTEMPT: 'PROM-ATT-',
  OUTCOME: 'PROM-OUT-',
  RECEIPT: 'PROM-RCP-',
} as const;

export const PROMOTION_STATUS = {
  CREATED: 'created',
  CHECKS_COMPLETED: 'checks-completed',
  APPROVED: RECONCILIATION_PROPOSAL_STATUS.APPROVED,
  INTEGRATION_PENDING: 'integration-pending',
  INTEGRATED: 'integrated',
  CLOSED: SPRINT_STATE.CLOSED,
  REJECTED: RECONCILIATION_PROPOSAL_STATUS.REJECTED,
  BLOCKED: STATUS.BLOCKED,
} as const;

export const PROMOTION_STATUS_VALUES = Object.values(PROMOTION_STATUS);

export const PROMOTION_CHECK = {
  CLEAN_VERIFICATION: 'clean-verification',
  WRITE_SET: 'candidate-write-set',
} as const;

export const PROMOTION_CHECK_STATUS = {
  PASS: PREFLIGHT_STATUS.PASS,
  FAIL: PREFLIGHT_STATUS.FAIL,
} as const;

export const INTEGRATION_OUTCOME = {
  SUCCEEDED: 'succeeded',
  FAILED: GATEWAY_RUN_STATUS.FAILED,
  UNKNOWN: PREFLIGHT_STATUS.UNKNOWN,
} as const;

export const INTEGRATION_OUTCOME_VALUES = Object.values(INTEGRATION_OUTCOME);

export const PROMOTION_TRIGGER = {
  CANDIDATE_CREATED: 'candidate-created',
  CHECKS_PASSED: 'checks-passed',
  REVIEW_APPROVED: 'review-approved',
  REVIEW_REJECTED: 'review-rejected',
  INTEGRATION_STARTED: 'integration-started',
  INTEGRATION_SUCCEEDED: 'integration-succeeded',
  INTEGRATION_FAILED: 'integration-failed',
  INTEGRATION_UNKNOWN: 'integration-unknown',
  TASK_CLOSED: 'task-closed',
} as const;

export const PROMOTION_ERROR = {
  CANDIDATE_NOT_FOUND: 'PROMOTION_CANDIDATE_NOT_FOUND',
  CANDIDATE_INVALID: 'PROMOTION_CANDIDATE_INVALID',
  CANDIDATE_STALE: 'PROMOTION_CANDIDATE_STALE',
  CHECK_FAILED: 'PROMOTION_CHECK_FAILED',
  INVALID_STATE: 'PROMOTION_INVALID_STATE',
  REVIEW_INVALID: 'PROMOTION_REVIEW_INVALID',
  REVIEW_REJECTED: 'PROMOTION_REVIEW_REJECTED',
  SELF_REVIEW: 'PROMOTION_SELF_REVIEW',
  TARGET_STALE: 'PROMOTION_TARGET_STALE',
  INTEGRATION_FAILED: 'PROMOTION_INTEGRATION_FAILED',
  INTEGRATION_UNKNOWN: 'PROMOTION_INTEGRATION_UNKNOWN',
  TASK_STATE_INVALID: 'PROMOTION_TASK_STATE_INVALID',
  INPUT_INVALID: 'PROMOTION_INPUT_INVALID',
} as const;

export const PROMOTION_REVIEW_PHASE = STATUS.REVIEW;
