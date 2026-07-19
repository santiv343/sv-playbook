import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { addPromotionTables } from './promotion.migrations.js';
import { PROMOTION_STORE_SCHEMA } from './store.constants.js';

test('addPromotionTables backfills missing columns onto a pre-GATE-012 promotion_candidates table', () => {
  const db = new Database(':memory:');
  // Simulate an aged store created before GATE-012 added review_candidate_id
  // and the work_definition/config/contract columns.
  db.exec(`CREATE TABLE promotion_candidates (
    candidate_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    candidate_sha TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  addPromotionTables(db);

  const columns = db.prepare("SELECT name FROM pragma_table_info('promotion_candidates')").pluck(true).all().map(String);
  const expected = 'review_candidate_id work_definition_version work_definition_digest config_digest contract_digest'.split(' ');
  for (const name of expected) {
    assert.ok(columns.includes(name));
  }
  db.close();
});

test('addPromotionTables is a no-op on an already-current store', () => {
  const db = new Database(':memory:');
  addPromotionTables(db);
  addPromotionTables(db); // second call must not throw or duplicate anything
  db.close();
});

test('addPromotionTables preserves UNIQUE and FK constraints when backfilling review_candidate_id (IDEA-120)', () => {
  const freshDb = new Database(':memory:');
  freshDb.exec(PROMOTION_STORE_SCHEMA);
  const freshFKs = freshDb.prepare("SELECT * FROM pragma_foreign_key_list('promotion_candidates') ORDER BY id, seq").all();
  const freshIndexes = freshDb.prepare("SELECT * FROM pragma_index_list('promotion_candidates') ORDER BY seq").all();
  freshDb.close();

  const agedDb = new Database(':memory:');
  agedDb.exec(`CREATE TABLE promotion_candidates (
    candidate_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    candidate_sha TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  addPromotionTables(agedDb);

  const migratedFKs = agedDb.prepare("SELECT * FROM pragma_foreign_key_list('promotion_candidates') ORDER BY id, seq").all();
  const migratedIndexes = agedDb.prepare("SELECT * FROM pragma_index_list('promotion_candidates') ORDER BY seq").all();

  assert.deepEqual(migratedFKs, freshFKs);
  assert.deepEqual(migratedIndexes, freshIndexes);

  agedDb.close();
});
