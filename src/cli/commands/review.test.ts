import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command as reviewCommand } from './review.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';
import { openStore } from '../../db/store.js';
import { artifactContracts, workflowArtifacts } from '../../orchestration/schema.constants.js';
import { initTestRepo } from '../../testkit.js';
import { packets, packetDefinitions } from '../../tasks/schema.constants.js';
import { ensureSession } from '../../tasks/service.js';
import { reviewCandidates } from '../../review/schema.constants.js';

const CANDIDATE_ID = 'RC-CLI-001';
const PACKET_ID = 'PKT-CLI-001';
const UNKNOWN_CANDIDATE = 'RC-NOPE';
const CONTRACT_REF = 'review-candidate/v3';
const DEFINITION_DIGEST = 'sha256:def';
const ARTIFACT_DIGEST = 'sha256:artifact';
const SCHEMA_DIGEST = 'sha256:schema';
const CREATED_AT = '2026-07-18T12:00:00.000Z';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

function seedReviewCandidateState(store: ReturnType<typeof openStore>, root: string): void {
  store.orm.insert(artifactContracts).values({
    ref: CONTRACT_REF,
    schemaJson: '{}',
    schemaDigest: SCHEMA_DIGEST,
    status: 'active',
    createdAt: CREATED_AT,
  }).run();
  store.orm.insert(packets).values({
    id: PACKET_ID,
    title: 'CLI review candidate fixture',
    status: 'ready',
    body: '',
    writeSetJson: JSON.stringify(['src/**']),
    type: 'task',
    priority: 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }).run();
  store.orm.insert(packetDefinitions).values({
    packetId: PACKET_ID,
    version: 1,
    definitionDigest: DEFINITION_DIGEST,
    definitionJson: '{}',
    createdAt: CREATED_AT,
  }).run();
  const sessionId = ensureSession(store, root);
  const artifactId = 'ART-CLI-001';
  store.orm.insert(workflowArtifacts).values({
    id: artifactId,
    contractRef: CONTRACT_REF,
    valueJson: '{}',
    valueDigest: ARTIFACT_DIGEST,
    producerKind: 'runtime',
    producerRef: sessionId,
    createdAt: CREATED_AT,
  }).run();
  store.orm.insert(reviewCandidates).values({
    id: CANDIDATE_ID,
    packetId: PACKET_ID,
    workDefinitionVersion: 1,
    workDefinitionDigest: DEFINITION_DIGEST,
    candidateSha: 'sha-cli',
    branch: 'feature/cli-review',
    producerSessionId: sessionId,
    artifactId,
    createdAt: CREATED_AT,
  }).run();
}

function withTempRepo<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'svp-review-cli-'));
  initTestRepo(root);
  const prev = process.cwd();
  process.chdir(root);
  try {
    return fn(root);
  } finally {
    process.chdir(prev);
  }
}

function seedReviewCandidate(root: string): void {
  const store = openStore(root);
  try {
    seedReviewCandidateState(store, root);
  } finally {
    store.close();
  }
}

test('review candidate list prints candidate ids and shas', async () => {
  await withTempRepo(async (root) => {
    seedReviewCandidate(root);
    const io = fakeIo();
    assert.equal(await reviewCommand.run(['candidate', 'list'], io), EXIT.OK);
    const output = io.outLines.join('\n');
    assert.match(output, new RegExp(`${CANDIDATE_ID}\\tsha-cli\\tfeature/cli-review`));
  });
});

test('review candidate show prints full detail for one candidate', async () => {
  await withTempRepo(async (root) => {
    seedReviewCandidate(root);
    const io = fakeIo();
    assert.equal(await reviewCommand.run(['candidate', 'show', CANDIDATE_ID], io), EXIT.OK);
    const output = io.outLines.join('\n');
    assert.match(output, /candidate_sha|sha:/i);
    assert.match(output, /feature\/cli-review/);
  });
});

test('review candidate show on an unknown id reports a typed error', async () => {
  await withTempRepo(async () => {
    const io = fakeIo();
    assert.equal(await reviewCommand.run(['candidate', 'show', UNKNOWN_CANDIDATE], io), EXIT.GATE_FAIL);
    assert.ok(io.errLines.some((line) => line.includes(UNKNOWN_CANDIDATE)));
  });
});
