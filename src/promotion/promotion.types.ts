import type { Store } from '../db/store.types.js';
import type { ReviewCandidateIntegration } from '../review/review-candidate.types.js';
import type { INTEGRATION_OUTCOME, PROMOTION_STATUS, PROMOTION_VERDICT } from './promotion.constants.js';

export type PromotionStatus = typeof PROMOTION_STATUS[keyof typeof PROMOTION_STATUS];
export type PromotionVerdict = typeof PROMOTION_VERDICT[keyof typeof PROMOTION_VERDICT];
export type IntegrationOutcome = typeof INTEGRATION_OUTCOME[keyof typeof INTEGRATION_OUTCOME];

export interface PromotionRequest {
  readonly reviewCandidateId: string;
  readonly reviewerRunSpecId: string;
  readonly targetRef?: string;
}

export interface PromotionReceipt {
  readonly id: string;
  readonly candidateId: string;
  readonly reviewCandidateId: string;
  readonly taskId: string;
  readonly candidateSha: string;
  readonly targetRef: string;
  readonly resultSha: string;
  readonly integration: ReviewCandidateIntegration;
  readonly reviewerRunSpecId: string;
  readonly verificationDigest: string;
  readonly createdAt: string;
}

export interface CandidateIdentity {
  readonly id: string;
  readonly reviewCandidateId: string;
  readonly taskId: string;
  readonly workDefinitionVersion: number;
  readonly workDefinitionDigest: string;
  readonly baseSha: string;
  readonly candidateSha: string;
  readonly configDigest: string;
  readonly contractDigest: string;
  readonly createdAt: string;
}

export interface CandidateEvidence {
  readonly identity: CandidateIdentity;
  readonly artifactId: string;
  readonly artifactDigest: string;
  readonly producerSessionId: string;
  readonly changedFiles: readonly string[];
  readonly integration: ReviewCandidateIntegration;
  readonly preflightOverall: string;
  readonly cleanVerificationCandidateSha: string | null;
  readonly cleanVerificationStatus: string;
}

export interface ValidatedReviewVerdict {
  readonly runSpecId: string;
  readonly reviewerSessionId: string;
  readonly outputDigest: string;
  readonly verdict: PromotionVerdict;
  readonly payloadJson: string;
}

export interface GitPromotionPort {
  headSha(worktree: string): string;
  refSha(repoRoot: string, ref: string): string;
  isAncestor(repoRoot: string, ancestorSha: string, descendantSha: string): boolean;
  fastForwardRef(repoRoot: string, ref: string, beforeSha: string, candidateSha: string): void;
}

export interface IntegrationObservation {
  readonly outcome: IntegrationOutcome;
  readonly resultSha: string | null;
  readonly reason: string | null;
}

export interface PromotionFixture {
  readonly root: string;
  readonly store: Store;
  readonly baseSha: string;
  readonly candidateSha: string;
  readonly reviewCandidateId: string;
  readonly producerSessionId: string;
  readonly reviewerRunSpecId: string;
}

export interface StoredIntegrationAttempt {
  readonly id: string;
  readonly candidateId: string;
  readonly effectKey: string;
  readonly targetRef: string;
  readonly beforeSha: string;
  readonly candidateSha: string;
  readonly createdAt: string;
}

export interface ParsedReviewCandidateArtifact {
  readonly taskId: string;
  readonly workDefinitionVersion: number;
  readonly workDefinitionDigest: string;
  readonly baseSha: string;
  readonly candidateSha: string;
  readonly producerSessionId: string;
  readonly changedFiles: readonly string[];
  readonly integration: ReviewCandidateIntegration;
  readonly preflightOverall: string;
  readonly cleanVerificationCandidateSha: string | null;
  readonly cleanVerificationStatus: string;
}

export interface ParsedReviewOutput {
  readonly candidateSha: string;
  readonly taskId: string;
  readonly workDefinitionVersion: number;
  readonly workDefinitionDigest: string;
  readonly verdict: PromotionVerdict;
}

export interface PromotionDashboardItem {
  readonly candidateId: string;
  readonly reviewCandidateId: string;
  readonly taskId: string;
  readonly candidateSha: string;
  readonly status: PromotionStatus;
  readonly targetRef: string | null;
  readonly integrationOutcome: IntegrationOutcome | null;
  readonly receiptId: string | null;
  readonly updatedAt: string;
}
