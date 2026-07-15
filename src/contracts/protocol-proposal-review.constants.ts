export const PROTOCOL_PROPOSAL_REVIEW_FIELD = {
  PROPOSAL_ID: 'proposalId',
  PROPOSAL_DIGEST: 'proposalDigest',
} as const;

export const PROTOCOL_PROPOSAL_REVIEW_VERDICT = {
  PASS: 'PASS',
  FAIL: 'FAIL',
} as const;

export const PROTOCOL_PROPOSAL_STATUS = {
  EVALUATED: 'evaluated',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  APPLIED: 'applied',
} as const;

export const INVALID_STORED_PROPOSAL = 'stored proposal is not an object';
export const PROTOCOL_PROPOSAL_REVIEW_LABEL = 'review';
export const UPDATE_PROTOCOL_PROPOSAL_STATUS_SQL = 'UPDATE protocol_proposals SET status = ? WHERE id = ?';

export const PROTOCOL_PROPOSAL_ERROR = {
  INCOMPLETE_BATCH_SET: 'INCOMPLETE_PROTOCOL_PROPOSAL_BATCH_SET',
} as const;
