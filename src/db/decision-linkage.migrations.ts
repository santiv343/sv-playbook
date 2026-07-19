import type Database from 'better-sqlite3';
import { DATABASE_COLUMN, DATABASE_TABLE, SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

export function addDecisionLinkage(db: Database.Database): void {
  migrateTableColumn(db, DATABASE_TABLE.DECISIONS, DATABASE_COLUMN.PACKET_ID, SQLITE_COLUMN_TYPE.TEXT, false);
  migrateTableColumn(db, DATABASE_TABLE.DECISIONS, DATABASE_COLUMN.ANSWERED_AGAINST_VERSION, SQLITE_COLUMN_TYPE.INTEGER, false);
}
