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
