import type Database from 'better-sqlite3';
import { PROMOTION_TABLE } from '../promotion/promotion.schema.constants.js';
import {
  REVIEW_CANDIDATE_INTEGRATION,
  REVIEW_CANDIDATE_INTEGRATION_FIELD,
} from '../review/review-candidate.constants.js';
import { PROMOTION_STORE_SCHEMA } from './store.constants.js';
import { SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

interface BackfillColumn {
  name: string;
  type: string;
  notNull: boolean;
}

const BACKFILL_COLUMNS: readonly BackfillColumn[] = [
  { name: 'review_candidate_id', type: 'TEXT', notNull: true },
  { name: 'work_definition_version', type: 'INTEGER', notNull: true },
  { name: 'work_definition_digest', type: 'TEXT', notNull: true },
  { name: 'config_digest', type: 'TEXT', notNull: true },
  { name: 'contract_digest', type: 'TEXT', notNull: true },
];

export function addPromotionTables(db: Database.Database): void {
  db.exec(PROMOTION_STORE_SCHEMA);
  const existingColumns = new Set(
    db.prepare(`SELECT name FROM pragma_table_info('${PROMOTION_TABLE.CANDIDATES}')`).pluck(true).all().map(String),
  );
  const missing = BACKFILL_COLUMNS.filter(col => !existingColumns.has(col.name));
  if (missing.length === 0) return;

  if (!existingColumns.has('review_candidate_id')) {
    const rows = db.prepare(`SELECT * FROM ${PROMOTION_TABLE.CANDIDATES}`).all();
    const oldCols = [...existingColumns];
    db.exec(`DROP TABLE ${PROMOTION_TABLE.CANDIDATES}`);
    db.exec(PROMOTION_STORE_SCHEMA);
    if (rows.length > 0) {
      const placeholders = oldCols.map(() => '?').join(', ');
      const insert = db.prepare(
        `INSERT INTO ${PROMOTION_TABLE.CANDIDATES} (${oldCols.join(', ')}) VALUES (${placeholders})`,
      );
      for (const row of rows) {
        insert.run(...oldCols.map(col => (row as Record<string, unknown>)[col]));
      }
    }
    return;
  }

  for (const col of missing) {
    migrateTableColumn(db, PROMOTION_TABLE.CANDIDATES, col.name, col.type, col.notNull);
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
