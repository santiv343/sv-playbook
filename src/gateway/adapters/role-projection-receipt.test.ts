import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { gatewayFixture } from '../gateway.test-support.js';
import { roleProjectionReceipts } from '../schema.constants.js';
import { recordRoleProjectionReceipts, roleProjectionReceiptViolations } from './role-projection-receipt.js';
import { ROLE_PROJECTION_RECEIPT_ERROR } from './role-projection-receipt.constants.js';
import type { RoleProjectionCandidate } from './role-projection.types.js';

const PROFILE_DIGEST = `sha256:${'c'.repeat(64)}`;
const ARTIFACT_DIGEST = `sha256:${'d'.repeat(64)}`;
const DRIFT_DIGEST = `sha256:${'e'.repeat(64)}`;

function candidate(root: string, artifactDigest = ARTIFACT_DIGEST): RoleProjectionCandidate {
  return {
    adapterId: 'fake',
    agentIds: ['implementer'],
    artifacts: [{ targetPath: join(root, 'fake-agent.json'), content: '{"agent":"implementer"}\n' }],
    profileDigest: PROFILE_DIGEST,
    artifactDigest,
  };
}

test('projection receipts are durable, idempotent, and reject artifact drift', async () => {
  const { root, store } = await gatewayFixture();
  const projection = candidate(root);

  assert.deepEqual(roleProjectionReceiptViolations(store, projection), [
    `${ROLE_PROJECTION_RECEIPT_ERROR.MISSING}: fake`,
  ]);
  const first = recordRoleProjectionReceipts(store, [projection]);
  const second = recordRoleProjectionReceipts(store, [projection]);
  assert.equal(second[0]?.id, first[0]?.id);
  assert.deepEqual(roleProjectionReceiptViolations(store, projection), []);
  assert.deepEqual(roleProjectionReceiptViolations(store, candidate(root, DRIFT_DIGEST)), [
    `${ROLE_PROJECTION_RECEIPT_ERROR.ARTIFACT_DRIFT}: fake`,
  ]);

  const receiptId = first[0]?.id;
  assert.notEqual(receiptId, undefined);
  assert.throws(() => {
    store.orm.update(roleProjectionReceipts).set({ artifactDigest: DRIFT_DIGEST })
      .where(eq(roleProjectionReceipts.id, receiptId ?? '')).run();
  }, /role projection receipts are immutable/);
  store.close();
});
