import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContextError } from '../context/context.errors.js';
import {
  hasReviewVerdictKind,
  parseReviewVerdict,
} from './review-verdict.js';
import { REVIEW_VERDICT_ERROR } from './review-verdict.constants.js';

const CANDIDATE_SHA = '330bd41d17ade0e00fdc3615d2f782ab77cd7680';
const WORK_DEFINITION_REF = { id: 'BUG-020', version: 2, digest: 'sha256:abc' };

function envelope(payload: unknown): unknown {
  return { kind: 'review-verdict', payload };
}

test('a complete review verdict parses into its payload', () => {
  const parsed = parseReviewVerdict(envelope({
    verdict: 'APPROVED',
    candidateSha: CANDIDATE_SHA,
    workDefinitionRef: WORK_DEFINITION_REF,
  }));
  assert.equal(parsed.candidateSha, CANDIDATE_SHA);
  assert.equal(parsed.verdict, 'APPROVED');
  assert.deepEqual(parsed.workDefinitionRef, WORK_DEFINITION_REF);
});

test('a verdict missing payload.workDefinitionRef is rejected with the failing path', () => {
  assert.throws(
    () => parseReviewVerdict(envelope({ verdict: 'APPROVED', candidateSha: CANDIDATE_SHA })),
    (error: unknown) => error instanceof ContextError
      && error.code === REVIEW_VERDICT_ERROR.INVALID
      && error.message.includes('payload.workDefinitionRef'),
  );
});

test('a verdict with an unknown verdict value is rejected', () => {
  assert.throws(
    () => parseReviewVerdict(envelope({
      verdict: 'REQUEST CHANGES',
      candidateSha: CANDIDATE_SHA,
      workDefinitionRef: WORK_DEFINITION_REF,
    })),
    (error: unknown) => error instanceof ContextError && error.code === REVIEW_VERDICT_ERROR.INVALID,
  );
});

test('kind detection only fires on the review-verdict kind', () => {
  assert.ok(hasReviewVerdictKind(envelope({})));
  assert.ok(!hasReviewVerdictKind({ kind: 'implementation-report' }));
  assert.ok(!hasReviewVerdictKind('review-verdict'));
  assert.ok(!hasReviewVerdictKind(null));
});
