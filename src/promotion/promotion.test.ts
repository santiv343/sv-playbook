import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { packets } from '../tasks/schema.constants.js';
import { STATUS } from '../tasks/service.constants.js';
import { movePacket } from '../tasks/service.js';
import { PromotionController } from './promotion.controller.js';
import { PROMOTION_ERROR, PROMOTION_STATUS, PROMOTION_VERDICT } from './promotion.constants.js';
import { PromotionError } from './promotion.errors.js';
import { candidateStatus } from './promotion.repository.js';
import { readPromotionDashboard } from './promotion.receipts.js';
import { gitSha, promotionFixture } from './promotion.test.support.js';

function request(fixture: Awaited<ReturnType<typeof promotionFixture>>) {
  return {
    reviewCandidateId: fixture.reviewCandidateId,
    reviewerRunSpecId: fixture.reviewerRunSpecId,
  };
}

test('real local promotion binds clean verification, review, integration, and close', async () => {
  const fixture = await promotionFixture();
  const controller = new PromotionController(fixture.store, fixture.root);
  const receipt = await controller.promote(request(fixture));

  assert.equal(receipt.candidateSha, fixture.candidateSha);
  assert.equal(receipt.resultSha, fixture.candidateSha);
  assert.equal(gitSha(fixture.root, 'main'), fixture.candidateSha);
  const task = fixture.store.orm.select({ status: packets.status }).from(packets).get();
  assert.equal(task?.status, STATUS.DONE);
  assert.equal(candidateStatus(fixture.store, receipt.candidateId), PROMOTION_STATUS.CLOSED);
  assert.deepEqual(await controller.promote(request(fixture)), receipt);
  assert.deepEqual(readPromotionDashboard(fixture.store), [{
    candidateId: receipt.candidateId,
    reviewCandidateId: fixture.reviewCandidateId,
    taskId: receipt.taskId,
    candidateSha: fixture.candidateSha,
    status: PROMOTION_STATUS.CLOSED,
    targetRef: 'main',
    integrationOutcome: 'succeeded',
    receiptId: receipt.id,
    updatedAt: receipt.createdAt,
  }]);
  fixture.store.close();
});

test('review output bound to another SHA is rejected before integration', async () => {
  const fixture = await promotionFixture({ outputCandidateSha: '0000000000000000000000000000000000000000' });
  await assert.rejects(
    new PromotionController(fixture.store, fixture.root).promote(request(fixture)),
    (error: unknown) => error instanceof PromotionError && error.code === PROMOTION_ERROR.REVIEW_INVALID,
  );
  assert.equal(gitSha(fixture.root, 'main'), fixture.baseSha);
  assert.equal(fixture.store.orm.select({ status: packets.status }).from(packets).get()?.status, STATUS.REVIEW);
  fixture.store.close();
});

test('reviewer rejection cannot produce done', async () => {
  const fixture = await promotionFixture({ verdict: PROMOTION_VERDICT.REQUEST_CHANGES });
  await assert.rejects(
    new PromotionController(fixture.store, fixture.root).promote(request(fixture)),
    (error: unknown) => error instanceof PromotionError && error.code === PROMOTION_ERROR.REVIEW_REJECTED,
  );
  assert.equal(gitSha(fixture.root, 'main'), fixture.baseSha);
  assert.equal(fixture.store.orm.select({ status: packets.status }).from(packets).get()?.status, STATUS.REVIEW);
  fixture.store.close();
});

test('direct task transition to done is mechanically unavailable', async () => {
  const fixture = await promotionFixture();
  assert.throws(() => { movePacket(fixture.store, undefined, 'GATE-PROMOTION-TEST', STATUS.DONE); });
  assert.equal(fixture.store.orm.select({ status: packets.status }).from(packets)
    .where(eq(packets.id, 'GATE-PROMOTION-TEST')).get()?.status, STATUS.REVIEW);
  fixture.store.close();
});
