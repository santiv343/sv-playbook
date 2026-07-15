import { ContextError } from '../context/context.errors.js';
import { s } from '../schema/index.js';
import { SchemaError } from '../schema/core.errors.js';
import {
  REVIEW_VERDICT_ERROR,
  REVIEW_VERDICT_KIND,
  ReviewVerdictEnvelopeSchema,
} from './review-verdict.constants.js';
import type { ParsedReviewVerdict } from './review-verdict.types.js';

const ReviewVerdictKindSchema = s.object({ kind: s.literal(REVIEW_VERDICT_KIND) });

export function hasReviewVerdictKind(value: unknown): boolean {
  try {
    ReviewVerdictKindSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function parseReviewVerdict(value: unknown): ParsedReviewVerdict {
  try {
    return ReviewVerdictEnvelopeSchema.parse(value).payload;
  } catch (error: unknown) {
    if (error instanceof SchemaError) {
      throw new ContextError(
        REVIEW_VERDICT_ERROR.INVALID,
        `review verdict is invalid at ${error.path.join('.')}: ${error.detail}`,
      );
    }
    throw error;
  }
}
