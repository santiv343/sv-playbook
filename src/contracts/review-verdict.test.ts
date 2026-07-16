import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContextError } from '../context/context.errors.js';
import { createArtifactValidator } from './artifacts.js';
import {
  hasReviewVerdictKind,
  parseReviewVerdict,
} from './review-verdict.js';
import { REVIEW_VERDICT_ENVELOPE_JSON_SCHEMA, REVIEW_VERDICT_ERROR } from './review-verdict.constants.js';

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

test('a verdict may carry a rationale; absence stays valid', () => {
  const withRationale = parseReviewVerdict(envelope({
    verdict: 'REQUEST_CHANGES',
    candidateSha: CANDIDATE_SHA,
    workDefinitionRef: WORK_DEFINITION_REF,
    rationale: 'Candidate carries no machine-readable evidence.',
  }));
  assert.equal(withRationale.rationale, 'Candidate carries no machine-readable evidence.');
  const withoutRationale = parseReviewVerdict(envelope({
    verdict: 'APPROVED',
    candidateSha: CANDIDATE_SHA,
    workDefinitionRef: WORK_DEFINITION_REF,
  }));
  assert.equal(withoutRationale.rationale, undefined);
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

const validateJsonSchema = createArtifactValidator().compile(REVIEW_VERDICT_ENVELOPE_JSON_SCHEMA);

function parsesAsVerdict(value: unknown): boolean {
  try {
    parseReviewVerdict(value);
    return true;
  } catch (error: unknown) {
    if (error instanceof ContextError && error.code === REVIEW_VERDICT_ERROR.INVALID) return false;
    throw error;
  }
}

// The JSON Schema the agent receives and the s-schema the gateway enforces are two
// views of one contract; this corpus locks them to identical accept/reject behavior,
// including open-object semantics for extra fields the agent may add.
const EQUIVALENCE_CORPUS: ReadonlyArray<{ label: string; value: unknown; valid: boolean }> = [
  {
    label: 'minimal valid verdict',
    value: envelope({ verdict: 'APPROVED', candidateSha: CANDIDATE_SHA, workDefinitionRef: WORK_DEFINITION_REF }),
    valid: true,
  },
  {
    label: 'request-changes verdict with agent-added fields stays valid',
    value: envelope({
      verdict: 'REQUEST_CHANGES',
      candidateSha: CANDIDATE_SHA,
      workDefinitionRef: WORK_DEFINITION_REF,
      confidence: 'high',
      findings: [{ id: 'f1', severity: 'high' }],
    }),
    valid: true,
  },
  {
    label: 'request-changes verdict with rationale is valid',
    value: envelope({
      verdict: 'REQUEST_CHANGES',
      candidateSha: CANDIDATE_SHA,
      workDefinitionRef: WORK_DEFINITION_REF,
      rationale: 'Candidate carries no machine-readable evidence.',
    }),
    valid: true,
  },
  {
    label: 'empty rationale is rejected',
    value: envelope({
      verdict: 'REQUEST_CHANGES',
      candidateSha: CANDIDATE_SHA,
      workDefinitionRef: WORK_DEFINITION_REF,
      rationale: '',
    }),
    valid: false,
  },
  {
    label: 'non-string rationale is rejected',
    value: envelope({
      verdict: 'REQUEST_CHANGES',
      candidateSha: CANDIDATE_SHA,
      workDefinitionRef: WORK_DEFINITION_REF,
      rationale: 42,
    }),
    valid: false,
  },
  {
    label: 'lowercase verdict is rejected',
    value: envelope({ verdict: 'approved', candidateSha: CANDIDATE_SHA, workDefinitionRef: WORK_DEFINITION_REF }),
    valid: false,
  },
  {
    label: 'verdict with inner space is rejected',
    value: envelope({ verdict: 'REQUEST CHANGES', candidateSha: CANDIDATE_SHA, workDefinitionRef: WORK_DEFINITION_REF }),
    valid: false,
  },
  {
    label: 'missing candidateSha is rejected',
    value: envelope({ verdict: 'APPROVED', workDefinitionRef: WORK_DEFINITION_REF }),
    valid: false,
  },
  {
    label: 'missing workDefinitionRef is rejected',
    value: envelope({ verdict: 'APPROVED', candidateSha: CANDIDATE_SHA }),
    valid: false,
  },
  {
    label: 'missing payload is rejected',
    value: { kind: 'review-verdict' },
    valid: false,
  },
  {
    label: 'workDefinitionRef missing digest is rejected',
    value: envelope({ verdict: 'APPROVED', candidateSha: CANDIDATE_SHA, workDefinitionRef: { id: 'BUG-020', version: 2 } }),
    valid: false,
  },
  {
    label: 'string version is rejected',
    value: envelope({
      verdict: 'APPROVED', candidateSha: CANDIDATE_SHA,
      workDefinitionRef: { id: 'BUG-020', version: '2', digest: 'sha256:abc' },
    }),
    valid: false,
  },
  {
    label: 'fractional version is rejected',
    value: envelope({
      verdict: 'APPROVED', candidateSha: CANDIDATE_SHA,
      workDefinitionRef: { id: 'BUG-020', version: 2.5, digest: 'sha256:abc' },
    }),
    valid: false,
  },
  {
    label: 'empty candidateSha is rejected',
    value: envelope({ verdict: 'APPROVED', candidateSha: '', workDefinitionRef: WORK_DEFINITION_REF }),
    valid: false,
  },
  {
    label: 'non-object payload is rejected',
    value: envelope('APPROVED'),
    valid: false,
  },
  {
    label: 'wrong kind is rejected',
    value: { kind: 'implementation-report', payload: { verdict: 'APPROVED', candidateSha: CANDIDATE_SHA, workDefinitionRef: WORK_DEFINITION_REF } },
    valid: false,
  },
  {
    label: 'extra top-level fields follow open-object semantics',
    value: {
      kind: 'review-verdict',
      payload: { verdict: 'APPROVED', candidateSha: CANDIDATE_SHA, workDefinitionRef: WORK_DEFINITION_REF },
      projections: [],
    },
    valid: true,
  },
];

test('the JSON Schema mirror and the parser accept and reject the same verdicts', () => {
  for (const { label, value, valid } of EQUIVALENCE_CORPUS) {
    assert.equal(validateJsonSchema(value), valid, `json-schema mismatch: ${label}`);
    assert.equal(parsesAsVerdict(value), valid, `parser mismatch: ${label}`);
  }
});
