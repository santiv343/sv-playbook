import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { openStore } from '../db/store.js';
import { artifactContracts, workflowArtifacts } from '../orchestration/schema.constants.js';
import { WORKFLOW_EXECUTOR } from '../orchestration/orchestration.constants.js';
import { reviewCandidates } from '../review/schema.constants.js';
import { packetDefinitions, packets } from '../tasks/schema.constants.js';
import { STATUS } from '../tasks/service.constants.js';
import { PROMOTION_ID_PREFIX } from './promotion.constants.js';
import { promotionId, recordIntegrationIntent } from './promotion.repository.js';
import { promotionCandidates } from './promotion.schema.constants.js';

const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  worktree: text('worktree').notNull(),
  harness: text('harness'),
  model: text('model'),
  startedAt: text('started_at').notNull(),
});

function seedPacket(
  store: ReturnType<typeof openStore>,
  taskId: string,
  reviewCandidateId: string,
  artifactId: string,
  candidateSha: string,
  now: string,
): void {
  store.orm.insert(packets).values({
    id: taskId,
    title: `Packet ${taskId}`,
    path: `docs/packets/${taskId}.md`,
    status: STATUS.REVIEW,
    body: '',
    writeSetJson: '[]',
    type: '',
    priority: 100,
    createdAt: now,
    updatedAt: now,
  }).run();
  store.orm.insert(packetDefinitions).values({
    packetId: taskId,
    version: 1,
    definitionDigest: 'sha256:definition',
    definitionJson: '{}',
    createdAt: now,
  }).run();
  store.orm.insert(workflowArtifacts).values({
    id: artifactId,
    contractRef: 'sha256:contract',
    valueJson: '{}',
    valueDigest: 'sha256:value',
    producerKind: WORKFLOW_EXECUTOR.AGENT,
    producerRef: 'test-producer',
    createdAt: now,
  }).run();
  store.orm.insert(reviewCandidates).values({
    id: reviewCandidateId,
    packetId: taskId,
    workDefinitionVersion: 1,
    workDefinitionDigest: 'sha256:work-definition',
    candidateSha,
    branch: 'main',
    producerSessionId: 'SESSION-TEST',
    artifactId,
    createdAt: now,
  }).run();
}

test('recordIntegrationIntent includes taskId in effectKey to avoid collisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-promotion-repo-'));
  const store = openStore(root);
  const now = new Date().toISOString();

  store.orm.insert(sessions).values({
    id: 'SESSION-TEST',
    worktree: root,
    startedAt: now,
  }).run();

  store.orm.insert(artifactContracts).values({
    ref: 'sha256:contract',
    schemaJson: '{}',
    schemaDigest: 'sha256:schema',
    status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    createdAt: now,
  }).run();

  const targetRef = 'main';
  const beforeSha = '0000000000000000000000000000000000000000';
  const candidateSha = '1111111111111111111111111111111111111111';

  seedPacket(store, 'TASK-A', 'RC-A', 'ART-A', candidateSha, now);
  seedPacket(store, 'TASK-B', 'RC-B', 'ART-B', candidateSha, now);

  const base = {
    workDefinitionVersion: 1,
    workDefinitionDigest: 'sha256:work-definition',
    baseSha: 'sha256:base',
    candidateSha,
    configDigest: 'sha256:config',
    contractDigest: 'sha256:contract',
    createdAt: now,
  };
  const candidateA = {
    ...base,
    id: promotionId(PROMOTION_ID_PREFIX.CANDIDATE),
    reviewCandidateId: 'RC-A',
    taskId: 'TASK-A',
  };
  const candidateB = {
    ...base,
    id: promotionId(PROMOTION_ID_PREFIX.CANDIDATE),
    reviewCandidateId: 'RC-B',
    taskId: 'TASK-B',
  };

  store.orm.insert(promotionCandidates).values(candidateA).run();
  store.orm.insert(promotionCandidates).values(candidateB).run();

  const attemptA = recordIntegrationIntent(store, candidateA, targetRef, beforeSha);
  const attemptB = recordIntegrationIntent(store, candidateB, targetRef, beforeSha);

  assert.notEqual(attemptA.effectKey, attemptB.effectKey);

  store.close();
});
