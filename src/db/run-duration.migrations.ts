import type Database from 'better-sqlite3';
import { EXECUTION_PROFILES_TABLE, MAX_RUN_DURATION_COLUMN, RUN_SPECS_TABLE } from './context.schema.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

// El mismo `max_run_duration_ms` se agrega a DOS tablas relacionadas —
// execution_profiles (el default configurado) y run_specs (el valor
// congelado al momento de despachar, ver executionProfileSnapshotJson) —
// para que cambiar el default de un profile no afecte runs ya despachados.
export function addRunDurationCeiling(db: Database.Database): void {
  const columnType = `INTEGER CHECK (${MAX_RUN_DURATION_COLUMN} > 0)`;
  migrateTableColumn(db, EXECUTION_PROFILES_TABLE, MAX_RUN_DURATION_COLUMN, columnType, false);
  migrateTableColumn(db, RUN_SPECS_TABLE, MAX_RUN_DURATION_COLUMN, columnType, false);
}
