import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { addDecisionLinkage } from './decision-linkage.migrations.js';

test('addDecisionLinkage adds packet_id and answered_against_version columns to decisions', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE decisions (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE packets (id TEXT PRIMARY KEY)`);
  db.prepare('INSERT INTO packets (id) VALUES (?)').run('PKT-1');
  db.prepare(
    "INSERT INTO decisions (id, question, created_at, updated_at) VALUES ('DEC-1', 'q', 'now', 'now')",
  ).run();

  addDecisionLinkage(db);

  db.prepare('UPDATE decisions SET packet_id = ?, answered_against_version = ? WHERE id = ?')
    .run('PKT-1', 1, 'DEC-1');
  const row = db.prepare('SELECT packet_id, answered_against_version FROM decisions WHERE id = ?').get('DEC-1');
  assert.deepEqual(row, { packet_id: 'PKT-1', answered_against_version: 1 });
  db.close();
});
