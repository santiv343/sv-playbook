import { s } from '../schema/index.js';
import { SchemaError } from '../schema/core.errors.js';
import { ReviewVerdictEnvelopeSchema } from '../contracts/review-verdict.constants.js';
import { REVIEW_CANDIDATE_INTEGRATION } from '../review/review-candidate.constants.js';
import { PROMOTION_ERROR } from './promotion.constants.js';
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
    integration: s.optional(s.nonEmptyString()),
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

const ReviewOutputSchema = s.json(ReviewVerdictEnvelopeSchema);

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

// Dos esquemas de validación distintos para dos artefactos distintos que
// entran a promotion desde afuera: el candidato en sí (lo que armó el
// implementer, contra review-candidate.ts) y el veredicto del reviewer
// (contra ReviewVerdictEnvelopeSchema, contracts/review-verdict.constants.ts
// — el schema COMPARTIDO documentado ahí). ReviewCandidateArtifactSchema es
// deliberadamente MÁS LAXO que REVIEW_CANDIDATE_SCHEMA_V3 completo — sólo
// pide los campos que promotion.ts necesita leer, no re-valida todo el
// contrato (eso ya lo hizo review-candidate.ts al crearlo).
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
    integration: parsed.candidate.integration === REVIEW_CANDIDATE_INTEGRATION.INTEGRATED
      ? REVIEW_CANDIDATE_INTEGRATION.INTEGRATED
      : REVIEW_CANDIDATE_INTEGRATION.PENDING,
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
