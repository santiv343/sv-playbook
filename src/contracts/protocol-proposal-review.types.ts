export interface ProtocolProposalFinding {
  contractRef: string;
  issue: string;
  requiredCorrection: string;
}

// findings (ProtocolProposalFinding[]) es evidencia OBLIGATORIA para un
// FAIL — el reviewer no puede rechazar sin decir por contractRef qué
// está mal y qué correction se necesita, mecanizando "no rechazo sin
// razón específica".
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
