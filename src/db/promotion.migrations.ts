import type Database from 'better-sqlite3';
import { PROMOTION_CANDIDATE_COLUMN, PROMOTION_TABLE } from '../promotion/promotion.schema.constants.js';
import {
  REVIEW_CANDIDATE_INTEGRATION,
  REVIEW_CANDIDATE_INTEGRATION_FIELD,
} from '../review/review-candidate.constants.js';
import { PROMOTION_STORE_SCHEMA } from './store.constants.js';
import { SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { column } from './rows.js';
import { migrateTableColumn } from './store.migration-helpers.js';
import { EMPTY_SIZE } from '../platform.constants.js';

interface BackfillColumn {
  name: string;
  type: string;
  notNull: boolean;
}

const BACKFILL_COLUMNS: readonly BackfillColumn[] = [
  { name: PROMOTION_CANDIDATE_COLUMN.REVIEW_CANDIDATE_ID, type: SQLITE_COLUMN_TYPE.TEXT, notNull: true },
  { name: PROMOTION_CANDIDATE_COLUMN.WORK_DEFINITION_VERSION, type: SQLITE_COLUMN_TYPE.INTEGER, notNull: true },
  { name: PROMOTION_CANDIDATE_COLUMN.WORK_DEFINITION_DIGEST, type: SQLITE_COLUMN_TYPE.TEXT, notNull: true },
  { name: PROMOTION_CANDIDATE_COLUMN.CONFIG_DIGEST, type: SQLITE_COLUMN_TYPE.TEXT, notNull: true },
  { name: PROMOTION_CANDIDATE_COLUMN.CONTRACT_DIGEST, type: SQLITE_COLUMN_TYPE.TEXT, notNull: true },
];

function hasReviewCandidateFK(db: Database.Database): boolean {
  return db.prepare(
    `SELECT id FROM pragma_foreign_key_list('${PROMOTION_TABLE.CANDIDATES}') WHERE "from" = ?`,
  ).get(PROMOTION_CANDIDATE_COLUMN.REVIEW_CANDIDATE_ID) !== undefined;
}

function reinsertRows(db: Database.Database, rows: unknown[], oldCols: string[]): void {
  const placeholders = oldCols.map(() => '?').join(', ');
  const insert = db.prepare(
    `INSERT INTO ${PROMOTION_TABLE.CANDIDATES} (${oldCols.join(', ')}) VALUES (${placeholders})`,
  );
  try {
    for (const row of rows) {
      const values = oldCols.map(col => column(row, col));
      insert.run(...values);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `promotion_candidates has ${rows.length} pre-existing row(s) that cannot satisfy the new schema constraints (${msg}). Back up the store, ensure review_candidates are seeded, then re-run.`,
    );
  }
}

function rebuildWithConstraints(db: Database.Database, existingColumns: Set<string>): void {
  const rows = db.prepare(`SELECT * FROM ${PROMOTION_TABLE.CANDIDATES}`).all();
  const oldCols = [...existingColumns];
  db.exec(`DROP TABLE ${PROMOTION_TABLE.CANDIDATES}`);
  db.exec(PROMOTION_STORE_SCHEMA);
  if (rows.length > EMPTY_SIZE) {
    reinsertRows(db, rows, oldCols);
  }
}

export function addPromotionTables(db: Database.Database): void {
  db.exec(PROMOTION_STORE_SCHEMA);
  const existingColumns = new Set(
    db.prepare(`SELECT name FROM pragma_table_info('${PROMOTION_TABLE.CANDIDATES}')`).pluck(true).all().map(String),
  );
  const missing = BACKFILL_COLUMNS.filter(col => !existingColumns.has(col.name));
  const hasReviewFK = hasReviewCandidateFK(db);

  if (missing.length === EMPTY_SIZE && hasReviewFK) return;

  if (!existingColumns.has(PROMOTION_CANDIDATE_COLUMN.REVIEW_CANDIDATE_ID) || !hasReviewFK) {
    rebuildWithConstraints(db, existingColumns);
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
