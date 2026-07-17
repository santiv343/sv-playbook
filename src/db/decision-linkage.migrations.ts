import type Database from 'better-sqlite3';
import { DATABASE_COLUMN, SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

const DECISIONS_TABLE = 'decisions';

export function addDecisionLinkage(db: Database.Database): void {
  migrateTableColumn(db, DECISIONS_TABLE, DATABASE_COLUMN.PACKET_ID, SQLITE_COLUMN_TYPE.TEXT, false);
  migrateTableColumn(db, DECISIONS_TABLE, DATABASE_COLUMN.ANSWERED_AGAINST_VERSION, SQLITE_COLUMN_TYPE.INTEGER, false);
}
