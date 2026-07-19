import type { PreflightReport } from './preflight.types.js';
import type { REVIEW_CANDIDATE_INTEGRATION } from './review-candidate.constants.js';

export type ReviewCandidateIntegration = (typeof REVIEW_CANDIDATE_INTEGRATION)[keyof typeof REVIEW_CANDIDATE_INTEGRATION];

export interface ReviewCandidateNote {
  readonly at: string;
  readonly detail: string;
}

export interface ReviewCandidateValue {
  readonly kind: string;
  readonly workDefinition: { readonly id: string; readonly version: number; readonly digest: string };
  readonly candidate: {
    readonly sha: string;
    readonly branch: string;
    readonly baseSha: string;
    readonly changedFiles: readonly string[];
    readonly diffDigest: string;
    readonly diff: string;
    readonly integration?: ReviewCandidateIntegration;
  };
  readonly producer: { readonly sessionId: string };
  readonly evidence: {
    readonly preflight: PreflightReport;
    readonly catalog: { readonly version: number; readonly digest: string };
    readonly projections: readonly {
      readonly adapterId: string;
      readonly receiptId: string;
      readonly artifactDigest: string;
    }[];
    readonly notes: readonly ReviewCandidateNote[];
  };
  readonly createdAt: string;
}

export type ReviewProjectionEvidence = ReviewCandidateValue['evidence']['projections'];

export interface PendingReviewCandidate {
  readonly id: string;
  readonly artifactId: string;
  readonly value: ReviewCandidateValue;
  readonly valueJson: string;
  readonly valueDigest: string;
}

export interface ManualInputBinding {
  readonly artifactId: string;
  readonly contractRef: string;
}

export interface ReviewCandidateSummary {
  readonly id: string;
  readonly packetId: string;
  readonly workDefinitionVersion: number;
  readonly candidateSha: string;
  readonly branch: string;
  readonly createdAt: string;
}
