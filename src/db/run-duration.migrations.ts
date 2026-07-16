import type Database from 'better-sqlite3';
import { EXECUTION_PROFILES_TABLE, MAX_RUN_DURATION_COLUMN, RUN_SPECS_TABLE } from './context.schema.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

export function addRunDurationCeiling(db: Database.Database): void {
  const columnType = `INTEGER CHECK (${MAX_RUN_DURATION_COLUMN} > 0)`;
  migrateTableColumn(db, EXECUTION_PROFILES_TABLE, MAX_RUN_DURATION_COLUMN, columnType, false);
  migrateTableColumn(db, RUN_SPECS_TABLE, MAX_RUN_DURATION_COLUMN, columnType, false);
}
