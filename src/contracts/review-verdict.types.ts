import type { REVIEW_VERDICT } from './review-verdict.constants.js';

export type ReviewVerdict = typeof REVIEW_VERDICT[keyof typeof REVIEW_VERDICT];

export interface ReviewVerdictWorkDefinitionRef {
  readonly id: string;
  readonly version: number;
  readonly digest: string;
}

// El shape parseado y tipado del contrato compartido REVIEW_VERDICT_KIND
// (review-verdict.constants.ts) — workDefinitionRef con digest es lo que
// ata el veredicto a una versión EXACTA del work definition, no sólo al
// id/version, así promotion.parsers.ts puede detectar si el candidato que
// se está promoviendo ya no matchea contra qué se revisó.
export interface ParsedReviewVerdict {
  readonly candidateSha: string;
  readonly verdict: ReviewVerdict;
  readonly workDefinitionRef: ReviewVerdictWorkDefinitionRef;
  readonly rationale?: string;
}
