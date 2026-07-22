import { desc, eq } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { reviewCandidates } from './schema.constants.js';
import type { ReviewCandidateSummary } from './review-candidate.types.js';

function selectReviewCandidateSummary() {
  return {
    id: reviewCandidates.id,
    packetId: reviewCandidates.packetId,
    workDefinitionVersion: reviewCandidates.workDefinitionVersion,
    candidateSha: reviewCandidates.candidateSha,
    branch: reviewCandidates.branch,
    createdAt: reviewCandidates.createdAt,
  };
}

// Lecturas de sólo resumen (sin el JSON completo del artifact, que puede
// pesar mucho — ver reviewCandidateMaxBytes en config) para listados en CLI
// y consola operativa; el contenido completo se resuelve por separado
// (loadCandidateEvidence en promotion.repository.ts) sólo cuando
// efectivamente se necesita procesar un candidato puntual.
export function listReviewCandidates(store: Store, packetId?: string): readonly ReviewCandidateSummary[] {
  const columns = selectReviewCandidateSummary();
  if (packetId === undefined) {
    return store.orm.select(columns).from(reviewCandidates)
      .orderBy(desc(reviewCandidates.createdAt)).all();
  }
  return store.orm.select(columns).from(reviewCandidates)
    .where(eq(reviewCandidates.packetId, packetId))
    .orderBy(desc(reviewCandidates.createdAt)).all();
}

export function getReviewCandidate(store: Store, id: string): ReviewCandidateSummary | undefined {
  return store.orm.select(selectReviewCandidateSummary()).from(reviewCandidates)
    .where(eq(reviewCandidates.id, id)).get();
}
