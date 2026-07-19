import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { addPromotionTables } from './promotion.migrations.js';
import { PROMOTION_STORE_SCHEMA } from './store.constants.js';
import { stringColumn } from './rows.js';

test('addPromotionTables backfills missing columns onto a pre-GATE-012 promotion_candidates table', () => {
  const db = new Database(':memory:');
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
  addPromotionTables(db);
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

test('addPromotionTables preserves pre-existing rows with valid review_candidate_id constraints applied (IDEA-120)', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE review_candidates (id TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE packets (id TEXT PRIMARY KEY)');

  const reviewId = 'rev-1';
  db.prepare('INSERT INTO review_candidates (id) VALUES (?)').run(reviewId);
  const taskId = 'task-1';
  db.prepare('INSERT INTO packets (id) VALUES (?)').run(taskId);

  db.exec(`CREATE TABLE promotion_candidates (
    candidate_id TEXT PRIMARY KEY,
    review_candidate_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    work_definition_version INTEGER NOT NULL,
    work_definition_digest TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    candidate_sha TEXT NOT NULL,
    config_digest TEXT NOT NULL,
    contract_digest TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  const row = {
    candidate_id: 'cand-1',
    review_candidate_id: reviewId,
    task_id: taskId,
    work_definition_version: 1,
    work_definition_digest: 'wd-digest',
    base_sha: 'abc123',
    candidate_sha: 'def456',
    config_digest: 'cfg-digest',
    contract_digest: 'ct-digest',
    created_at: '2024-01-01T00:00:00.000Z',
  };
  db.prepare(`INSERT INTO promotion_candidates (
    candidate_id, review_candidate_id, task_id,
    work_definition_version, work_definition_digest,
    base_sha, candidate_sha, config_digest, contract_digest,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.candidate_id, row.review_candidate_id, row.task_id,
    row.work_definition_version, row.work_definition_digest,
    row.base_sha, row.candidate_sha, row.config_digest, row.contract_digest,
    row.created_at,
  );

  addPromotionTables(db);

  const saved = db.prepare('SELECT * FROM promotion_candidates').all();
  assert.equal(saved.length, 1);
  const savedRow = saved[0];
  assert.equal(stringColumn(savedRow, 'candidate_id'), row.candidate_id);
  assert.equal(stringColumn(savedRow, 'review_candidate_id'), row.review_candidate_id);
  assert.equal(stringColumn(savedRow, 'task_id'), row.task_id);
  assert.equal(stringColumn(savedRow, 'base_sha'), row.base_sha);
  assert.equal(stringColumn(savedRow, 'candidate_sha'), row.candidate_sha);
  assert.equal(stringColumn(savedRow, 'created_at'), row.created_at);

  const freshDb = new Database(':memory:');
  freshDb.exec(PROMOTION_STORE_SCHEMA);
  const freshFKs = freshDb.prepare("SELECT * FROM pragma_foreign_key_list('promotion_candidates') ORDER BY id, seq").all();
  const freshIndexes = freshDb.prepare("SELECT * FROM pragma_index_list('promotion_candidates') ORDER BY seq").all();
  freshDb.close();

  const migratedFKs = db.prepare("SELECT * FROM pragma_foreign_key_list('promotion_candidates') ORDER BY id, seq").all();
  const migratedIndexes = db.prepare("SELECT * FROM pragma_index_list('promotion_candidates') ORDER BY seq").all();

  assert.deepEqual(migratedFKs, freshFKs);
  assert.deepEqual(migratedIndexes, freshIndexes);

  db.close();
});

test('addPromotionTables fails with clear error when pre-existing rows reference non-existent review_candidates (IDEA-120)', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE review_candidates (id TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE packets (id TEXT PRIMARY KEY)');

  const taskId = 'task-2';
  db.prepare('INSERT INTO packets (id) VALUES (?)').run(taskId);

  db.exec(`CREATE TABLE promotion_candidates (
    candidate_id TEXT PRIMARY KEY,
    review_candidate_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    work_definition_version INTEGER NOT NULL,
    work_definition_digest TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    candidate_sha TEXT NOT NULL,
    config_digest TEXT NOT NULL,
    contract_digest TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  db.prepare(`INSERT INTO promotion_candidates (
    candidate_id, review_candidate_id, task_id,
    work_definition_version, work_definition_digest,
    base_sha, candidate_sha, config_digest, contract_digest,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'cand-bad', 'nonexistent-review-id', taskId,
    1, 'wd-digest',
    'abc123', 'def456', 'cfg-digest', 'ct-digest',
    '2024-01-01T00:00:00.000Z',
  );

  assert.throws(
    () => { addPromotionTables(db); },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('promotion_candidates'));
      assert.ok(err.message.includes('cannot satisfy'));
      return true;
    },
  );

  db.close();
});
