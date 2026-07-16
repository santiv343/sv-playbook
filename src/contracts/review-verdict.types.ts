import type { REVIEW_VERDICT } from './review-verdict.constants.js';

export type ReviewVerdict = typeof REVIEW_VERDICT[keyof typeof REVIEW_VERDICT];

export interface ReviewVerdictWorkDefinitionRef {
  readonly id: string;
  readonly version: number;
  readonly digest: string;
}

export interface ParsedReviewVerdict {
  readonly candidateSha: string;
  readonly verdict: ReviewVerdict;
  readonly workDefinitionRef: ReviewVerdictWorkDefinitionRef;
  readonly rationale?: string;
}
