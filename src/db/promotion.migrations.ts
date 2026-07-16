import type Database from 'better-sqlite3';
import { PROMOTION_TABLE } from '../promotion/promotion.schema.constants.js';
import {
  REVIEW_CANDIDATE_INTEGRATION,
  REVIEW_CANDIDATE_INTEGRATION_FIELD,
} from '../review/review-candidate.constants.js';
import { PROMOTION_STORE_SCHEMA } from './store.constants.js';
import { SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

export function addPromotionTables(db: Database.Database): void {
  db.exec(PROMOTION_STORE_SCHEMA);
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
