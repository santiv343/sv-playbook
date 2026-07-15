import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContextError } from '../context/context.errors.js';
import { REFERENCE_KIND } from '../platform.constants.js';
import { WORK_DEFINITION_INITIAL_VERSION } from '../tasks/work-definition.constants.js';
import { dispatchRun } from './gateway.js';
import { GATEWAY_LIFECYCLE_ERROR, GATEWAY_RUN_STATUS } from './gateway.constants.js';
import { loadRunSnapshot } from './gateway-repository.js';
import { prepareRunSpec } from './run-spec.js';
import { FakeAdapter, gatewayFixture } from './gateway.test-support.js';
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

test('terminal provider failure detail is durable and uses a stable gateway error code', async () => {
  const { root, store } = await gatewayFixture();
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  adapter.observations.push({
    adapterId: adapter.id,
    sessionId: 'session-1',
    messageId: 'message-1',
    state: 'failed',
    progressToken: 'provider-failed',
    observedToolIds: [],
    failure: {
      code: 'UnknownError',
      message: 'unknown certificate verification error',
      evidence: { provider: 'test' },
    },
    evidence: { source: 'fake' },
  });

  await assert.rejects(
    dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root),
    (error: unknown) => error instanceof ContextError
      && error.code === GATEWAY_LIFECYCLE_ERROR.AGENT_RUN_FAILED
      && error.message.includes('unknown certificate verification error'),
  );
  const snapshot = loadRunSnapshot(store, runSpec.id);
  assert.ok(snapshot);
  assert.equal(snapshot.status, GATEWAY_RUN_STATUS.FAILED);
  assert.equal(snapshot.detail, 'UnknownError: unknown certificate verification error');
  store.close();
});

test('a review verdict missing payload.workDefinitionRef is rejected at completion', async () => {
  const { root, store } = await gatewayFixture();
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  adapter.observations.push({
    adapterId: adapter.id,
    sessionId: 'session-1',
    messageId: 'message-1',
    state: 'completed',
    progressToken: 'provider-completed',
    observedToolIds: [],
    output: JSON.stringify({
      kind: 'review-verdict',
      payload: { verdict: 'APPROVED', candidateSha: '330bd41d17ade0e00fdc3615d2f782ab77cd7680' },
    }),
    evidence: { source: 'fake' },
  });

  await assert.rejects(
    dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root),
    (error: unknown) => error instanceof ContextError && error.message.includes('workDefinitionRef'),
  );
  const snapshot = loadRunSnapshot(store, runSpec.id);
  assert.ok(snapshot);
  assert.equal(snapshot.status, GATEWAY_RUN_STATUS.OUTPUT_INVALID);
  store.close();
});
