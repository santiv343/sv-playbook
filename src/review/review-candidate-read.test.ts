import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openStore } from '../db/store.js';
import { artifactContracts, workflowArtifacts } from '../orchestration/schema.constants.js';
import { initTestRepo } from '../testkit.js';
import { packets, packetDefinitions } from '../tasks/schema.constants.js';
import { ensureSession } from '../tasks/service.js';
import { reviewCandidates } from './schema.constants.js';
import { getReviewCandidate, listReviewCandidates } from './review-candidate.js';

const CANDIDATE_A = 'RC-001';
const CANDIDATE_B = 'RC-002';
const CANDIDATE_C = 'RC-003';
const CANDIDATE_D = 'RC-004';
const CANDIDATE_E = 'RC-005';
const UNKNOWN_CANDIDATE = 'RC-NOPE';
const PACKET_A = 'PKT-A';
const PACKET_B = 'PKT-B';
const PACKET_C = 'PKT-C';
const PACKET_D = 'PKT-D';
const PACKET_E = 'PKT-E';
const SHA_A = 'sha-a';
const SHA_B = 'sha-b';
const SHA_C = 'sha-c';
const SHA_D = 'sha-d';
const SHA_E = 'sha-e';
const BRANCH_A = 'feature/a';
const BRANCH_B = 'feature/b';
const BRANCH_C = 'feature/c';
const BRANCH_D = 'feature/d';
const BRANCH_E = 'feature/e';
const CREATED_AT = '2026-07-18T12:00:00.000Z';
const CONTRACT_REF = 'review-candidate/v3';
const DEFINITION_DIGEST = 'sha256:def';
const ARTIFACT_DIGEST = 'sha256:artifact';
const SCHEMA_DIGEST = 'sha256:schema';
const WORKTREE_PREFIX = 'svp-review-candidate-read-';

function seedArtifactContract(store: ReturnType<typeof openStore>, createdAt: string): void {
  store.orm.insert(artifactContracts).values({
    ref: CONTRACT_REF,
    schemaJson: '{}',
    schemaDigest: SCHEMA_DIGEST,
    status: 'active',
    createdAt,
  }).run();
}

function seedCandidate(
  store: ReturnType<typeof openStore>,
  sessionId: string,
  candidateId: string,
  packetId: string,
  version: number,
  candidateSha: string,
  branch: string,
  createdAt: string,
): void {
  store.orm.insert(packets).values({
    id: packetId,
    title: `Test ${packetId}`,
    status: 'ready',
    body: '',
    writeSetJson: JSON.stringify(['src/**']),
    type: 'task',
    priority: 1,
    createdAt,
    updatedAt: createdAt,
  }).run();
  store.orm.insert(packetDefinitions).values({
    packetId,
    version,
    definitionDigest: DEFINITION_DIGEST,
    definitionJson: '{}',
    createdAt,
  }).run();
  const artifactId = `ART-${candidateId}`;
  store.orm.insert(workflowArtifacts).values({
    id: artifactId,
    contractRef: CONTRACT_REF,
    valueJson: '{}',
    valueDigest: ARTIFACT_DIGEST,
    producerKind: 'runtime',
    producerRef: sessionId,
    createdAt,
  }).run();
  store.orm.insert(reviewCandidates).values({
    id: candidateId,
    packetId,
    workDefinitionVersion: version,
    workDefinitionDigest: DEFINITION_DIGEST,
    candidateSha,
    branch,
    producerSessionId: sessionId,
    artifactId,
    createdAt,
  }).run();
}

function withTempStore<T>(prefix: string, fn: (store: ReturnType<typeof openStore>, root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), `${WORKTREE_PREFIX}${prefix}`));
  initTestRepo(root);
  const prev = process.cwd();
  process.chdir(root);
  try {
    const store = openStore(root);
    try {
      return fn(store, root);
    } finally {
      store.close();
    }
  } finally {
    process.chdir(prev);
  }
}

test('listReviewCandidates returns all candidates when no packetId filter is given', () => {
  withTempStore('list-', (store, root) => {
    const sessionId = ensureSession(store, root);
    seedArtifactContract(store, CREATED_AT);
    seedCandidate(store, sessionId, CANDIDATE_A, PACKET_A, 1, SHA_A, BRANCH_A, CREATED_AT);
    seedCandidate(store, sessionId, CANDIDATE_B, PACKET_B, 1, SHA_B, BRANCH_B, CREATED_AT);
    const result = listReviewCandidates(store);
    assert.equal(result.length, 2);
    assert.ok(result.some((candidate) => candidate.id === CANDIDATE_A));
    assert.ok(result.some((candidate) => candidate.id === CANDIDATE_B));
  });
});

test('listReviewCandidates filters by packetId when given', () => {
  withTempStore('filter-', (store, root) => {
    const sessionId = ensureSession(store, root);
    seedArtifactContract(store, CREATED_AT);
    seedCandidate(store, sessionId, CANDIDATE_C, PACKET_C, 1, SHA_C, BRANCH_C, CREATED_AT);
    seedCandidate(store, sessionId, CANDIDATE_D, PACKET_D, 1, SHA_D, BRANCH_D, CREATED_AT);
    const result = listReviewCandidates(store, PACKET_C);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, CANDIDATE_C);
  });
});

test('getReviewCandidate returns undefined for an unknown id', () => {
  withTempStore('missing-', (store) => {
    assert.equal(getReviewCandidate(store, UNKNOWN_CANDIDATE), undefined);
  });
});

test('getReviewCandidate returns the candidate for a known id', () => {
  withTempStore('show-', (store, root) => {
    const sessionId = ensureSession(store, root);
    seedArtifactContract(store, CREATED_AT);
    seedCandidate(store, sessionId, CANDIDATE_E, PACKET_E, 2, SHA_E, BRANCH_E, CREATED_AT);
    const result = getReviewCandidate(store, CANDIDATE_E);
    assert.ok(result);
    assert.equal(result.id, CANDIDATE_E);
    assert.equal(result.packetId, PACKET_E);
    assert.equal(result.workDefinitionVersion, 2);
    assert.equal(result.candidateSha, SHA_E);
    assert.equal(result.branch, BRANCH_E);
    assert.equal(result.createdAt, CREATED_AT);
  });
});
