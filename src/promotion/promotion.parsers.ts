import { s } from '../schema/index.js';
import { SchemaError } from '../schema/core.errors.js';
import {
  PROMOTION_ERROR,
  PROMOTION_VERDICT_VALUES,
  REVIEW_VERDICT_KIND,
} from './promotion.constants.js';
import { PromotionError } from './promotion.errors.js';
import type { ParsedReviewCandidateArtifact, ParsedReviewOutput } from './promotion.types.js';

const ReviewCandidateArtifactSchema = s.json(s.object({
  workDefinition: s.object({
    id: s.nonEmptyString(),
    version: s.integer(),
    digest: s.nonEmptyString(),
  }),
  candidate: s.object({
    baseSha: s.nonEmptyString(),
    sha: s.nonEmptyString(),
    changedFiles: s.array(s.string()),
  }),
  producer: s.object({
    sessionId: s.nonEmptyString(),
  }),
  evidence: s.object({
    preflight: s.object({
      overall: s.nonEmptyString(),
      cleanVerification: s.object({
        candidateSha: s.optional(s.nonEmptyString()),
        status: s.nonEmptyString(),
      }),
    }),
  }),
}));

const ReviewOutputSchema = s.json(s.object({
  kind: s.literal(REVIEW_VERDICT_KIND),
  payload: s.object({
    candidateSha: s.nonEmptyString(),
    verdict: s.enu(PROMOTION_VERDICT_VALUES),
    workDefinitionRef: s.object({
      id: s.nonEmptyString(),
      version: s.integer(),
      digest: s.nonEmptyString(),
    }),
  }),
}));

type PromotionErrorCode = ConstructorParameters<typeof PromotionError>[0];

function parseWith<T>(schema: { parse(value: unknown): T }, raw: string, code: PromotionErrorCode, label: string): T {
  try {
    return schema.parse(raw);
  } catch (error: unknown) {
    if (error instanceof SchemaError) {
      throw new PromotionError(code, `${label} is invalid at ${error.path.join('.')}: ${error.detail}`);
    }
    throw error;
  }
}

export function parseReviewCandidateArtifact(valueJson: string): ParsedReviewCandidateArtifact {
  const parsed = parseWith(ReviewCandidateArtifactSchema, valueJson, PROMOTION_ERROR.CANDIDATE_INVALID, 'review candidate artifact');
  const cleanVerification = parsed.evidence.preflight.cleanVerification;
  return {
    taskId: parsed.workDefinition.id,
    workDefinitionVersion: parsed.workDefinition.version,
    workDefinitionDigest: parsed.workDefinition.digest,
    baseSha: parsed.candidate.baseSha,
    candidateSha: parsed.candidate.sha,
    producerSessionId: parsed.producer.sessionId,
    changedFiles: parsed.candidate.changedFiles,
    preflightOverall: parsed.evidence.preflight.overall,
    cleanVerificationCandidateSha: cleanVerification.candidateSha ?? null,
    cleanVerificationStatus: cleanVerification.status,
  };
}

export function parseReviewOutput(outputJson: string): ParsedReviewOutput {
  const parsed = parseWith(ReviewOutputSchema, outputJson, PROMOTION_ERROR.REVIEW_INVALID, 'review output');
  return {
    candidateSha: parsed.payload.candidateSha,
    taskId: parsed.payload.workDefinitionRef.id,
    workDefinitionVersion: parsed.payload.workDefinitionRef.version,
    workDefinitionDigest: parsed.payload.workDefinitionRef.digest,
    verdict: parsed.payload.verdict,
  };
}
