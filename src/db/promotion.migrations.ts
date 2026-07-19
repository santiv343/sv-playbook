import type Database from 'better-sqlite3';
import { PROMOTION_TABLE } from '../promotion/promotion.schema.constants.js';
import {
  REVIEW_CANDIDATE_INTEGRATION,
  REVIEW_CANDIDATE_INTEGRATION_FIELD,
} from '../review/review-candidate.constants.js';
import { PROMOTION_STORE_SCHEMA } from './store.constants.js';
import { SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

const CANDIDATE_TABLE_PATTERN = /CREATE TABLE IF NOT EXISTS promotion_candidates\s*\(([\s\S]*?)\);/i;
const CANDIDATE_COLUMN_PATTERN = /^\s*([a-z_]+)\s+(INTEGER|TEXT)\b/img;

export function addPromotionTables(db: Database.Database): void {
  db.exec(PROMOTION_STORE_SCHEMA);
  const schemaMatch = PROMOTION_STORE_SCHEMA.match(CANDIDATE_TABLE_PATTERN);
  if (schemaMatch === null) return;
  const tableBody = schemaMatch[1];
  if (tableBody === undefined) return;
  const existingColumns = new Set(
    db.prepare(`SELECT name FROM pragma_table_info('${PROMOTION_TABLE.CANDIDATES}')`).pluck(true).all().map(String),
  );
  for (const match of tableBody.matchAll(CANDIDATE_COLUMN_PATTERN)) {
    const [, name, type] = match;
    if (name !== undefined && type !== undefined && !existingColumns.has(name)) {
      migrateTableColumn(db, PROMOTION_TABLE.CANDIDATES, name, type, false);
    }
  }
}

export function addPromotionReceiptIntegration(db: Database.Database): void {
  migrateTableColumn(
    db,
    PROMOTION_TABLE.RECEIPTS,
    REVIEW_CANDIDATE_INTEGRATION_FIELD,
    SQLITE_COLUMN_TYPE.TEXT,
    true,
    `'${REVIEW_CANDIDATE_INTEGRATION.PENDING}'`,
  );
}
