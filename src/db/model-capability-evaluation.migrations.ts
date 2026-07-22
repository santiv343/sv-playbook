import type Database from 'better-sqlite3';
import { MODEL_CAPABILITY_EVALUATION_STORE_SCHEMA } from './model-capability-evaluation.schema.constants.js';

// Migración de tabla nueva — CREATE TABLE IF NOT EXISTS la hace idempotente
// (mismo patrón que role-catalog.migrations.ts/review-candidate.migrations.ts).
export function addModelCapabilityEvaluations(db: Database.Database): void {
  db.exec(MODEL_CAPABILITY_EVALUATION_STORE_SCHEMA);
}
