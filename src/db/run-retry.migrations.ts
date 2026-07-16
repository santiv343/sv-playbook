import type Database from 'better-sqlite3';
import { RUN_SPECS_TABLE, RUN_SPEC_RETRY_OF_COLUMN } from './context.schema.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

export function addRunRetryLinkage(db: Database.Database): void {
  migrateTableColumn(db, RUN_SPECS_TABLE, RUN_SPEC_RETRY_OF_COLUMN, `TEXT REFERENCES ${RUN_SPECS_TABLE}(id)`, false);
}
