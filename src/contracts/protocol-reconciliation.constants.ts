// Vocabulario paralelo al de protocol-proposal-review.constants.ts pero
// para el dominio de reconciliación de vocabulario de escalación — mismos
// nombres de campo (proposalId/proposalDigest), mismo verdict PASS/FAIL,
// pero tablas y flujo separados (protocol_reconciliation_proposals, no
// protocol_proposals).
export const RECONCILIATION_VERDICT = {
  PASS: 'PASS',
  FAIL: 'FAIL',
} as const;

export const RECONCILIATION_REVIEW_FIELD = {
  PROPOSAL_ID: 'proposalId',
  PROPOSAL_DIGEST: 'proposalDigest',
  REVIEWER_SESSION_ID: 'reviewerSessionId',
} as const;

export const BEGIN_IMMEDIATE = 'BEGIN IMMEDIATE';
export const RECONCILIATION_REVIEW_LABEL = 'review';
export const RECONCILIATION_PROPOSAL_STATUS = {
  EVALUATED: 'evaluated',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
