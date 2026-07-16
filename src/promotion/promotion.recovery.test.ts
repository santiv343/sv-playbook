import assert from 'node:assert/strict';
import test from 'node:test';
import { SINGLE_SIZE } from '../platform.constants.js';
import { packets } from '../tasks/schema.constants.js';
import { STATUS } from '../tasks/service.constants.js';
import { PREFLIGHT_STATUS, type CleanVerificationReceipt } from '../review/preflight.types.js';
import { PromotionController } from './promotion.controller.js';
import { PROMOTION_ERROR } from './promotion.constants.js';
import { PromotionError } from './promotion.errors.js';
import type { GitPromotionPort } from './promotion.types.js';
import { promotionFixture } from './promotion.test.support.js';

function cleanReceipt(candidateSha: string): CleanVerificationReceipt {
  return {
    boundaryKind: 'detached-git-worktree',
    candidateSha,
    status: PREFLIGHT_STATUS.PASS,
    phases: [],
  };
}

test('post-effect adapter failure is recovered by observing the exact target SHA', async () => {
  const fixture = await promotionFixture();
  let targetSha = fixture.baseSha;
  let effectCount = 0;
  const git: GitPromotionPort = {
    headSha: () => fixture.candidateSha,
    refSha: () => targetSha,
    isAncestor: () => true,
    fastForwardRef: () => {
      effectCount += 1;
      targetSha = fixture.candidateSha;
      throw new Error('process lost response after effect');
    },
  };
  const controller = new PromotionController(fixture.store, fixture.root, {
    git,
    verifyClean: () => Promise.resolve(cleanReceipt(fixture.candidateSha)),
  });
  const receipt = await controller.promote({
    reviewCandidateId: fixture.reviewCandidateId,
    reviewerRunSpecId: fixture.reviewerRunSpecId,
  });
  assert.equal(receipt.resultSha, fixture.candidateSha);
  assert.equal(effectCount, 1);
  assert.deepEqual(await controller.promote({
    reviewCandidateId: fixture.reviewCandidateId,
    reviewerRunSpecId: fixture.reviewerRunSpecId,
  }), receipt);
  assert.equal(effectCount, 1);
  fixture.store.close();
});

test('failed integration remains review and cannot close', async () => {
  const fixture = await promotionFixture();
  const git: GitPromotionPort = {
    headSha: () => fixture.candidateSha,
    refSha: () => fixture.baseSha,
    isAncestor: () => true,
    fastForwardRef: () => { throw new Error('effect rejected'); },
  };
  await assert.rejects(
    new PromotionController(fixture.store, fixture.root, {
      git,
      verifyClean: () => Promise.resolve(cleanReceipt(fixture.candidateSha)),
    }).promote({
      reviewCandidateId: fixture.reviewCandidateId,
      reviewerRunSpecId: fixture.reviewerRunSpecId,
    }),
    (error: unknown) => error instanceof PromotionError && error.code === PROMOTION_ERROR.INTEGRATION_FAILED,
  );
  assert.equal(fixture.store.orm.select({ status: packets.status }).from(packets).get()?.status, STATUS.REVIEW);
  fixture.store.close();
});

test('diverged observation becomes unknown and blocks close', async () => {
  const fixture = await promotionFixture();
  let observations = 0;
  const git: GitPromotionPort = {
    headSha: () => fixture.candidateSha,
    refSha: () => {
      observations += 1;
      return observations === SINGLE_SIZE ? fixture.baseSha : '1111111111111111111111111111111111111111';
    },
    isAncestor: () => true,
    fastForwardRef: () => undefined,
  };
  await assert.rejects(
    new PromotionController(fixture.store, fixture.root, {
      git,
      verifyClean: () => Promise.resolve(cleanReceipt(fixture.candidateSha)),
    }).promote({
      reviewCandidateId: fixture.reviewCandidateId,
      reviewerRunSpecId: fixture.reviewerRunSpecId,
    }),
    (error: unknown) => error instanceof PromotionError && error.code === PROMOTION_ERROR.INTEGRATION_UNKNOWN,
  );
  assert.equal(fixture.store.orm.select({ status: packets.status }).from(packets).get()?.status, STATUS.REVIEW);
  fixture.store.close();
});
