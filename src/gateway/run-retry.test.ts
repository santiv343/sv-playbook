import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { ContextError } from '../context/context.errors.js';
import { REFERENCE_KIND } from '../platform.constants.js';
import { WORK_DEFINITION_INITIAL_VERSION } from '../tasks/work-definition.constants.js';
import { dispatchRun } from './gateway.js';
import { GATEWAY_RUN_STATUS, RUN_SPEC_ERROR } from './gateway.constants.js';
import { loadRunSnapshot } from './gateway-repository.js';
import { prepareRunSpec, prepareWorkflowRunSpec } from './run-spec.js';
import { retryRunSpec } from './run-retry.js';
import { runDispatches, runSpecs } from './schema.constants.js';
import { claimedAgentEffect, FakeAdapter, gatewayFixture } from './gateway.test-support.js';
import type { WorkRunSpecRequest } from './gateway.types.js';

function workRequest(): WorkRunSpecRequest {
  return {
    roleId: 'implementer',
    phase: 'delivery',
    workDefinitionRef: {
      kind: REFERENCE_KIND.WORK_DEFINITION,
      id: 'TASK-1',
      version: WORK_DEFINITION_INITIAL_VERSION,
    },
    executionProfileId: 'fake-impl',
  };
}

async function failRun(store: Store, root: string, runSpecId: string, idSuffix: string): Promise<void> {
  const adapter = new FakeAdapter();
  adapter.idSuffix = idSuffix;
  adapter.observations.push({
    adapterId: adapter.id,
    sessionId: `session-1${idSuffix}`,
    messageId: `message-1${idSuffix}`,
    state: 'failed',
    progressToken: 'provider-failed',
    observedToolIds: [],
    failure: { code: 'UnknownError', message: 'provider exploded', evidence: { provider: 'test' } },
    evidence: { source: 'fake' },
  });
  await assert.rejects(dispatchRun(store, runSpecId, new Map([[adapter.id, adapter]]), root));
}

function dispatchRefOf(store: Store, runSpecId: string): string {
  const row = store.orm.select({ dispatchRef: runDispatches.dispatchRef }).from(runDispatches)
    .where(eq(runDispatches.runSpecId, runSpecId)).get();
  assert.ok(row);
  return row.dispatchRef;
}

function runSpecCount(store: Store): number {
  return store.orm.select({ id: runSpecs.id }).from(runSpecs).all().length;
}

test('retry of a live run is refused and persists nothing', async () => {
  const { store } = await gatewayFixture();
  const runSpec = prepareRunSpec(store, workRequest());

  assert.throws(
    () => retryRunSpec(store, runSpec.id),
    (error: unknown) => error instanceof ContextError && error.code === RUN_SPEC_ERROR.RETRY_NOT_TERMINAL,
  );
  assert.equal(runSpecCount(store), 1);
  store.close();
});

test('retry of a completed run is refused', async () => {
  const { root, store } = await gatewayFixture();
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  await dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root);
  assert.equal(loadRunSnapshot(store, runSpec.id)?.status, GATEWAY_RUN_STATUS.COMPLETED);

  assert.throws(
    () => retryRunSpec(store, runSpec.id),
    (error: unknown) => error instanceof ContextError && error.code === RUN_SPEC_ERROR.RETRY_COMPLETED,
  );
  assert.equal(runSpecCount(store), 1);
  store.close();
});

test('workflow runs retry through the engine, never through dispatch retry', async () => {
  const { store } = await gatewayFixture();
  const effect = claimedAgentEffect(store);
  const runSpec = prepareWorkflowRunSpec(store, effect);

  assert.throws(
    () => retryRunSpec(store, runSpec.id),
    (error: unknown) => error instanceof ContextError && error.code === RUN_SPEC_ERROR.WORKFLOW_RETRY,
  );
  assert.equal(runSpecCount(store), 1);
  store.close();
});

test('retry mints a fresh attempt on the same subject and unbricks dispatch', async () => {
  const { root, store } = await gatewayFixture();
  const runSpec = prepareRunSpec(store, workRequest());
  await failRun(store, root, runSpec.id, ':a');
  assert.equal(loadRunSnapshot(store, runSpec.id)?.status, GATEWAY_RUN_STATUS.FAILED);

  const retry = retryRunSpec(store, runSpec.id);
  assert.notEqual(retry.id, runSpec.id);
  assert.equal(retry.retryOfRunSpecId, runSpec.id);
  assert.notEqual(retry.specDigest, runSpec.specDigest);
  assert.deepEqual(retry.workDefinitionRef, runSpec.workDefinitionRef);
  assert.equal(dispatchRefOf(store, retry.id), `${dispatchRefOf(store, runSpec.id)}:retry:2`);
  assert.equal(loadRunSnapshot(store, retry.id), undefined);

  const again = retryRunSpec(store, runSpec.id);
  assert.equal(again.id, retry.id);
  assert.equal(runSpecCount(store), 2);

  const adapter = new FakeAdapter();
  adapter.idSuffix = ':b';
  const receipt = await dispatchRun(store, retry.id, new Map([[adapter.id, adapter]]), root);
  assert.equal(adapter.sessionCreateCount, 1);
  assert.equal(adapter.turnSubmitCount, 1);
  assert.equal(receipt.session.sessionId, 'session-1:b');
  assert.equal(loadRunSnapshot(store, retry.id)?.status, GATEWAY_RUN_STATUS.COMPLETED);
  assert.equal(loadRunSnapshot(store, runSpec.id)?.status, GATEWAY_RUN_STATUS.FAILED);
  store.close();
});

test('retry chains attempts deterministically from the chain tip', async () => {
  const { root, store } = await gatewayFixture();
  const runSpec = prepareRunSpec(store, workRequest());
  await failRun(store, root, runSpec.id, ':a');
  const second = retryRunSpec(store, runSpec.id);
  await failRun(store, root, second.id, ':b');

  const third = retryRunSpec(store, second.id);
  assert.equal(third.retryOfRunSpecId, second.id);
  assert.equal(dispatchRefOf(store, third.id), `${dispatchRefOf(store, runSpec.id)}:retry:3`);
  assert.equal(runSpecCount(store), 3);
  store.close();
});
