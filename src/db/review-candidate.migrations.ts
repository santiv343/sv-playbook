import type Database from 'better-sqlite3';
import { REVIEW_CANDIDATE_STORE_SCHEMA } from './review-candidate.schema.constants.js';

// Migración de tabla nueva, mismo patrón idempotente que las demás
// (CREATE TABLE IF NOT EXISTS ya incluido en el schema string).
export function addReviewCandidates(db: Database.Database): void {
  db.exec(REVIEW_CANDIDATE_STORE_SCHEMA);
}
