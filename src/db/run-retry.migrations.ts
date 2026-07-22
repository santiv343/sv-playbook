import type Database from 'better-sqlite3';
import { RUN_SPECS_TABLE, RUN_SPEC_RETRY_OF_COLUMN } from './context.schema.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

// Encadena un RunSpec de reintento con el original (retryOfRunSpecId,
// self-referencia a la misma tabla) — es lo que retryRunSpec
// (gateway/run-retry.ts) usa para que un reintento sea rastreable hasta su
// intento inicial, sin duplicar toda la cadena de causalidad en otro lado.
export function addRunRetryLinkage(db: Database.Database): void {
  migrateTableColumn(db, RUN_SPECS_TABLE, RUN_SPEC_RETRY_OF_COLUMN, `TEXT REFERENCES ${RUN_SPECS_TABLE}(id)`, false);
}
