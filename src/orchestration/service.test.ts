import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addArtifactContract } from '../contracts/artifacts.js';
import { ARTIFACT_CONTRACT_ERROR, ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { ContextError } from '../context/context.errors.js';
import { WORKFLOW_ERROR, WORKFLOW_EXECUTOR, WORKFLOW_STATUS } from './orchestration.constants.js';
import { CAPABILITY_EFFECT, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { addContextItem, replaceContextPrecedence } from '../context/repository.js';
import { openStore } from '../db/store.js';
import { stringColumn } from '../db/rows.js';
import { addResponsibility, addRoleContract } from '../roles/catalog.js';
import {
  claimWorkflowEffect,
  failWorkflowEffect,
  readWorkflowSnapshot,
  recoverExpiredWorkflowEffects,
  registerWorkflowDefinition,
  renewWorkflowEffectLease,
  startWorkflow,
} from './service.js';
import { completeWorkflowEffect, resolveHumanWorkflowEffect } from './effect-completion.js';
import { readWorkflowDashboard } from './observability.js';
import { DrizzleWorkflowRepository } from './repository.js';

const TEST_WORKFLOW_FAILURE = {
  TRANSIENT: 'TEST_TRANSIENT_FAILURE',
  PERMANENT: 'TEST_PERMANENT_FAILURE',
} as const;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'svp-workflow-'));
  const store = openStore(root);
  addArtifactContract(store, {
    ref: 'request-v1', status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['request'], properties: { request: { type: 'string' } }, additionalProperties: false },
  });
  replaceContextPrecedence(store, ['role']);
  addContextItem(store, {
    id: 'ROLE-PLANNER', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.planner', body: 'Plan.', provenance: 'test',
    selectors: { role: ['planner'] }, capabilities: { 'artifact.read': CAPABILITY_EFFECT.ALLOW },
  });
  addContextItem(store, {
    id: 'ROLE-REFUTER', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.refuter', body: 'Refute.', provenance: 'test',
    selectors: { role: ['refuter'] }, capabilities: { 'artifact.read': CAPABILITY_EFFECT.ALLOW },
  });
  addResponsibility(store, { id: 'plan', classification: 'semantic', description: 'Plan work.' });
  addResponsibility(store, { id: 'refute', classification: 'semantic', description: 'Refute plans.' });
  addRoleContract(store, {
    roleId: 'planner', mission: 'Plan delivery.', contextItemRef: 'ROLE-PLANNER@1', inputContractRef: 'request-v1', outputContractRef: 'plan-v1',
    minimumModelCapability: 'planning', exclusiveJudgments: ['plan'], capabilityRequestClasses: [],
  });
  addRoleContract(store, {
    roleId: 'refuter', mission: 'Refute plans.', contextItemRef: 'ROLE-REFUTER@1', inputContractRef: 'plan-v1', outputContractRef: 'review-v1',
    minimumModelCapability: 'reasoning', exclusiveJudgments: ['refute'], capabilityRequestClasses: [],
  });
  addArtifactContract(store, {
    ref: 'plan-v1', status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['plan'], properties: { plan: { type: 'string' } }, additionalProperties: false },
  });
  addArtifactContract(store, {
    ref: 'review-v1', status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['verdict'], properties: { verdict: { enum: ['pass', 'fail'] } }, additionalProperties: false },
  });
  registerWorkflowDefinition(store, {
    id: 'delivery', startStepKey: 'plan',
    steps: [
      { key: 'plan', executor: WORKFLOW_EXECUTOR.AGENT, roleId: 'planner', phase: 'planning', inputContractRef: 'request-v1', outputContractRef: 'plan-v1', maxAttempts: 2 },
      { key: 'review', executor: WORKFLOW_EXECUTOR.AGENT, roleId: 'refuter', phase: 'refutation', inputContractRef: 'plan-v1', outputContractRef: 'review-v1', maxAttempts: 1 },
    ],
    routes: [
      { fromStepKey: 'plan', targetStepKey: 'review', priority: 0 },
      { fromStepKey: 'review', priority: 0 },
    ],
  });
  return store;
}

test('a workflow advances durably through claimed effects', async () => {
  const store = await fixture();
  const started = startWorkflow(store, {
    definitionId: 'delivery', subjectRef: 'project:demo', requestedBy: 'human:test',
    inputContractRef: 'request-v1', input: { request: 'Build it' },
  });
  assert.equal(started.status, WORKFLOW_STATUS.RUNNING);
  assert.equal(started.currentStepKey, 'plan');

  const plan = claimWorkflowEffect(store, 'worker-a', 60_000);
  assert.ok(plan);
  assert.equal(plan.stepKey, 'plan');
  assert.deepEqual(plan.input, { request: 'Build it' });
  assert.equal(plan.roleId, 'planner');
  completeWorkflowEffect(store, { effectId: plan.id, leaseOwner: 'worker-a', output: { plan: 'One bounded plan' } });

  const review = claimWorkflowEffect(store, 'worker-b', 60_000);
  assert.ok(review);
  assert.equal(review.stepKey, 'review');
  assert.deepEqual(review.input, { plan: 'One bounded plan' });
  completeWorkflowEffect(store, { effectId: review.id, leaseOwner: 'worker-b', output: { verdict: 'pass' } });

  const completed = readWorkflowSnapshot(store, started.id);
  assert.equal(completed.status, WORKFLOW_STATUS.COMPLETED);
  assert.equal(completed.currentStepKey, null);
  assert.equal(completed.revision, 5);
  assert.equal(claimWorkflowEffect(store, 'worker-c', 60_000), undefined);
  store.close();
});

test('workflow definition versions are allocated monotonically by the store', async () => {
  const store = await fixture();
  const registered = registerWorkflowDefinition(store, {
    id: 'delivery',
    startStepKey: 'plan',
    steps: [
      {
        key: 'plan', executor: WORKFLOW_EXECUTOR.AGENT, roleId: 'planner', phase: 'planning',
        inputContractRef: 'request-v1', outputContractRef: 'plan-v1', maxAttempts: 3,
      },
      {
        key: 'review', executor: WORKFLOW_EXECUTOR.AGENT, roleId: 'refuter', phase: 'refutation',
        inputContractRef: 'plan-v1', outputContractRef: 'review-v1', maxAttempts: 1,
      },
    ],
    routes: [
      { fromStepKey: 'plan', targetStepKey: 'review', priority: 0 },
      { fromStepKey: 'review', priority: 0 },
    ],
  });

  assert.equal(registered.version, 2);
  const current = startWorkflow(store, {
    definitionId: 'delivery', subjectRef: 'project:current', requestedBy: 'human:test',
    inputContractRef: 'request-v1', input: { request: 'Use the current definition' },
  });
  const historical = startWorkflow(store, {
    definitionId: 'delivery', definitionVersion: 1, subjectRef: 'project:historical', requestedBy: 'human:test',
    inputContractRef: 'request-v1', input: { request: 'Resume the historical definition' },
  });
  assert.equal(current.definitionVersion, 2);
  assert.equal(historical.definitionVersion, 1);
  store.close();
});

test('expired effect claims are recovered without losing the workflow', async () => {
  const store = await fixture();
  const started = startWorkflow(store, {
    definitionId: 'delivery', subjectRef: 'project:demo', requestedBy: 'human:test',
    inputContractRef: 'request-v1', input: { request: 'Recover me' },
  });
  const first = claimWorkflowEffect(store, 'dead-worker', 1, new Date('2026-01-01T00:00:00.000Z'));
  assert.ok(first);
  const recovered = recoverExpiredWorkflowEffects(store, new Date('2026-01-01T00:00:01.000Z'));
  assert.equal(recovered, 1);
  const replacement = claimWorkflowEffect(store, 'replacement', 60_000, new Date('2026-01-01T00:00:02.000Z'));
  assert.ok(replacement);
  assert.equal(replacement.id, first.id);
  assert.equal(readWorkflowSnapshot(store, started.id).status, WORKFLOW_STATUS.RUNNING);
  store.close();
});

test('invalid agent output cannot advance a workflow', async () => {
  const store = await fixture();
  startWorkflow(store, {
    definitionId: 'delivery', subjectRef: 'project:demo', requestedBy: 'human:test',
    inputContractRef: 'request-v1', input: { request: 'Validate me' },
  });
  const effect = claimWorkflowEffect(store, 'worker', 60_000);
  assert.ok(effect);
  assert.throws(
    () => completeWorkflowEffect(store, { effectId: effect.id, leaseOwner: 'worker', output: { invented: true } }),
    (error: unknown) => error instanceof ContextError && error.code === ARTIFACT_CONTRACT_ERROR.CONTRACT_VIOLATION,
  );
  assert.equal(claimWorkflowEffect(store, 'other', 60_000), undefined);
  store.close();
});

test('a retryable effect failure schedules the next bounded attempt', async () => {
  const store = await fixture();
  startWorkflow(store, {
    definitionId: 'delivery', subjectRef: 'project:demo', requestedBy: 'human:test',
    inputContractRef: 'request-v1', input: { request: 'Retry once' },
  });
  const first = claimWorkflowEffect(store, 'worker-a', 60_000);
  assert.ok(first);
  assert.equal(first.attempt, 1);
  assert.equal(first.maxAttempts, 2);

  const retrying = failWorkflowEffect(store, {
    effectId: first.id,
    leaseOwner: 'worker-a',
    failureCode: TEST_WORKFLOW_FAILURE.TRANSIENT,
    failureDetail: 'temporary adapter failure',
    retryable: true,
  });
  assert.equal(retrying.status, WORKFLOW_STATUS.RUNNING);

  const second = claimWorkflowEffect(store, 'worker-b', 60_000);
  assert.ok(second);
  assert.notEqual(second.id, first.id);
  assert.equal(second.attempt, 2);
  assert.deepEqual(second.input, first.input);
  store.close();
});

test('an exhausted retry budget fails the workflow durably', async () => {
  const store = await fixture();
  const started = startWorkflow(store, {
    definitionId: 'delivery', subjectRef: 'project:demo', requestedBy: 'human:test',
    inputContractRef: 'request-v1', input: { request: 'Fail after bounded retries' },
  });
  const first = claimWorkflowEffect(store, 'worker-a', 60_000);
  assert.ok(first);
  failWorkflowEffect(store, {
    effectId: first.id, leaseOwner: 'worker-a', failureCode: TEST_WORKFLOW_FAILURE.TRANSIENT,
    failureDetail: 'first failure', retryable: true,
  });
  const second = claimWorkflowEffect(store, 'worker-b', 60_000);
  assert.ok(second);
  const failed = failWorkflowEffect(store, {
    effectId: second.id, leaseOwner: 'worker-b', failureCode: TEST_WORKFLOW_FAILURE.PERMANENT,
    failureDetail: 'retry budget exhausted', retryable: true,
  });
  assert.equal(failed.id, started.id);
  assert.equal(failed.status, WORKFLOW_STATUS.FAILED);
  assert.equal(claimWorkflowEffect(store, 'worker-c', 60_000), undefined);
  store.close();
});

test('renewing a live lease prevents premature recovery', async () => {
  const store = await fixture();
  startWorkflow(store, {
    definitionId: 'delivery', subjectRef: 'project:demo', requestedBy: 'human:test',
    inputContractRef: 'request-v1', input: { request: 'Keep the active worker alive' },
  });
  const claimedAt = new Date('2026-01-01T00:00:00.000Z');
  const effect = claimWorkflowEffect(store, 'worker-a', 1_000, claimedAt);
  assert.ok(effect);
  const renewedUntil = renewWorkflowEffectLease(store, {
    effectId: effect.id,
    leaseOwner: 'worker-a',
    leaseMs: 2_000,
  }, new Date('2026-01-01T00:00:00.500Z'));
  assert.equal(renewedUntil, '2026-01-01T00:00:02.500Z');
  assert.equal(recoverExpiredWorkflowEffects(store, new Date('2026-01-01T00:00:01.500Z')), 0);
  assert.equal(recoverExpiredWorkflowEffects(store, new Date('2026-01-01T00:00:03.000Z')), 1);
  store.close();
});

test('a human effect remains waiting until a typed resolution advances it', async () => {
  const store = await fixture();
  registerWorkflowDefinition(store, {
    id: 'human-approval', startStepKey: 'approve',
    steps: [{
      key: 'approve', executor: WORKFLOW_EXECUTOR.HUMAN, phase: 'approval',
      inputContractRef: 'request-v1', outputContractRef: 'plan-v1', maxAttempts: 1,
    }],
    routes: [{ fromStepKey: 'approve', priority: 0 }],
  });
  const started = startWorkflow(store, {
    definitionId: 'human-approval', subjectRef: 'project:demo', requestedBy: 'human:test',
    inputContractRef: 'request-v1', input: { request: 'Approve the plan' },
  });
  assert.equal(started.status, WORKFLOW_STATUS.WAITING);
  assert.equal(claimWorkflowEffect(store, 'worker', 60_000), undefined);
  const waiting = readWorkflowDashboard(store);
  assert.equal(waiting.humanActions.length, 1);
  assert.deepEqual(waiting.humanActions[0]?.input, { request: 'Approve the plan' });

  const effectId = store.db.prepare('SELECT id FROM workflow_effects WHERE workflow_id = ?').get(started.id);
  const humanEffectId = stringColumn(effectId, 'id');
  const repository = new DrizzleWorkflowRepository(store);
  const recoveredAt = new Date('2026-01-01T00:00:02.000Z');
  assert.ok(repository.claimHuman(humanEffectId, 'human:dead', '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:00.000Z'));
  assert.equal(recoverExpiredWorkflowEffects(store, recoveredAt), 1);
  assert.equal(readWorkflowSnapshot(store, started.id).status, WORKFLOW_STATUS.WAITING);
  assert.equal(readWorkflowDashboard(store).humanActions.length, 1);

  assert.throws(
    () => resolveHumanWorkflowEffect(store, {
      effectId: 'missing-effect', resolvedBy: 'santi', output: { plan: 'Approved' },
    }),
    (error: unknown) => error instanceof ContextError && error.code === WORKFLOW_ERROR.HUMAN_EFFECT_NOT_PENDING,
  );
  const resolvedAt = new Date('2026-01-01T00:00:03.000Z');
  const completed = resolveHumanWorkflowEffect(store, {
    effectId: humanEffectId, resolvedBy: 'santi', output: { plan: 'Approved' },
  }, resolvedAt);
  assert.equal(completed.status, WORKFLOW_STATUS.COMPLETED);
  assert.equal(completed.currentStepKey, null);
  const dashboard = readWorkflowDashboard(store);
  assert.equal(dashboard.humanActions.length, 0);
  assert.ok(dashboard.events.length >= 3);
  assert.equal(completed.updatedAt, resolvedAt.toISOString());
  store.close();
});
