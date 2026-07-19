import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { listPromotionReceipts } from '../promotion/promotion.receipts.js';
import { REVIEW_CANDIDATE_INTEGRATION } from '../review/review-candidate.constants.js';
import { openStore, resolveStoreDir } from './store.js';
import {
  STORE_INITIAL_SCHEMA_VERSION,
  STORE_MIGRATION_ID,
  STORE_MIGRATION_IDS,
} from './store.migration-manifest.constants.js';

test('the receipt integration migration backfills legacy receipts as pending-integration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-receipt-integration-migration-'));
  const store = openStore(root);
  store.close();

  // Simulate a live store written before the integration column existed:
  // drop the column, insert a legacy-shaped receipt, rewind the schema version.
  const database = new DatabaseSync(join(resolveStoreDir(root), 'playbook.sqlite'));
  database.exec('PRAGMA foreign_keys = OFF');
  database.exec('ALTER TABLE promotion_receipts DROP COLUMN integration');
  database.exec(`INSERT INTO promotion_receipts (
    receipt_id, candidate_id, review_candidate_id, task_id, candidate_sha, target_ref,
    result_sha, reviewer_run_spec_id, verification_digest, receipt_json, receipt_digest, created_at
  ) VALUES (
    'PR-LEGACY', 'PC-LEGACY', 'RC-LEGACY', 'BUG-015', 'a', 'main',
    'a', 'RS-LEGACY', 'sha256:verification', '{}', 'sha256:receipt', '2026-07-01T00:00:00.000Z'
  )`);
  const versionBeforeIntegration = STORE_INITIAL_SCHEMA_VERSION
    + STORE_MIGRATION_IDS.indexOf(STORE_MIGRATION_ID.PROMOTION_RECEIPT_INTEGRATION);
  database.exec(`PRAGMA user_version = ${versionBeforeIntegration}`);
  database.close();

  const migrated = openStore(root);
  const integrations = listPromotionReceipts(migrated)
    .map((receipt) => `${receipt.id}:${receipt.integration}`);
  assert.deepEqual(integrations, [`PR-LEGACY:${REVIEW_CANDIDATE_INTEGRATION.PENDING}`]);
  migrated.close();
});
