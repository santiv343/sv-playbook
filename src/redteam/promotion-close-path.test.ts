import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import test from 'node:test';
import { PromotionController } from '../promotion/promotion.controller.js';
import { PROMOTION_ERROR, PROMOTION_STATUS } from '../promotion/promotion.constants.js';
import { PromotionError } from '../promotion/promotion.errors.js';
import { candidateStatus } from '../promotion/promotion.repository.js';
import { promotionCandidates } from '../promotion/promotion.schema.constants.js';
import { gitSha, promotionFixture } from '../promotion/promotion.test.support.js';
import { packets } from '../tasks/schema.constants.js';
import { STATUS } from '../tasks/service.constants.js';

test('an already-integrated candidate cannot close once the target ref moved past the certified SHA', async () => {
  const fixture = await promotionFixture({ integrated: true });
  // main advances after the candidate certified its SHA: the certification is now stale.
  execFileSync('git', ['commit', '--allow-empty', '-m', 'unrelated work'], { cwd: fixture.root });
  assert.notEqual(gitSha(fixture.root, 'main'), fixture.candidateSha);
  // The operator re-checks-out the certified SHA so the HEAD guard passes and the
  // target-ref guard is the one that must stop the promotion.
  execFileSync('git', ['checkout', '--detach', fixture.candidateSha], { cwd: fixture.root });

  await assert.rejects(
    new PromotionController(fixture.store, fixture.root).promote({
      reviewCandidateId: fixture.reviewCandidateId,
      reviewerRunSpecId: fixture.reviewerRunSpecId,
    }),
    (error: unknown) => error instanceof PromotionError
      && error.code === PROMOTION_ERROR.TARGET_STALE
      && error.message.includes('target ref no longer matches the candidate base'),
  );

  const task = fixture.store.orm.select({ status: packets.status }).from(packets).get();
  assert.equal(task?.status, STATUS.REVIEW, 'task must stay in review');
  const candidate = fixture.store.orm.select({ id: promotionCandidates.id }).from(promotionCandidates)
    .where(eq(promotionCandidates.reviewCandidateId, fixture.reviewCandidateId)).get();
  assert.ok(candidate !== undefined, 'promotion candidate was recorded');
  assert.equal(candidateStatus(fixture.store, candidate.id), PROMOTION_STATUS.APPROVED,
    'candidate must stay approved (retryable), never closed or blocked');
  fixture.store.close();
});
