export interface ProtocolProposalFinding {
  contractRef: string;
  issue: string;
  requiredCorrection: string;
}

export interface ProtocolProposalReview {
  proposalId: string;
  proposalDigest: string;
  reviewerSessionId: string;
  verdict: typeof PROTOCOL_PROPOSAL_REVIEW_VERDICT[keyof typeof PROTOCOL_PROPOSAL_REVIEW_VERDICT];
  findings: readonly ProtocolProposalFinding[];
}

export interface ProtocolProposalReviewEvaluation {
  valid: boolean;
  violations: readonly string[];
  reviewId: string;
  reviewDigest: string;
}
import type { PROTOCOL_PROPOSAL_REVIEW_VERDICT } from './protocol-proposal-review.constants.js';
