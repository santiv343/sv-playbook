import type Database from 'better-sqlite3';
import { REVIEW_CANDIDATE_STORE_SCHEMA } from './review-candidate.schema.constants.js';

export function addReviewCandidates(db: Database.Database): void {
  db.exec(REVIEW_CANDIDATE_STORE_SCHEMA);
}
