import { s } from '../schema/index.js';

export const REVIEW_VERDICT_KIND = 'review-verdict';

export const REVIEW_VERDICT = {
  APPROVED: 'APPROVED',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
} as const;

export const REVIEW_VERDICT_VALUES = Object.values(REVIEW_VERDICT);

export const REVIEW_VERDICT_ERROR = {
  INVALID: 'REVIEW_VERDICT_INVALID',
} as const;

export const ReviewVerdictEnvelopeSchema = s.object({
  kind: s.literal(REVIEW_VERDICT_KIND),
  payload: s.object({
    candidateSha: s.nonEmptyString(),
    verdict: s.enu(REVIEW_VERDICT_VALUES),
    workDefinitionRef: s.object({
      id: s.nonEmptyString(),
      version: s.integer(),
      digest: s.nonEmptyString(),
    }),
  }),
});
