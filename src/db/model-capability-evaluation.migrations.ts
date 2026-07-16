import type Database from 'better-sqlite3';
import { MODEL_CAPABILITY_EVALUATION_STORE_SCHEMA } from './model-capability-evaluation.schema.constants.js';

export function addModelCapabilityEvaluations(db: Database.Database): void {
  db.exec(MODEL_CAPABILITY_EVALUATION_STORE_SCHEMA);
}
