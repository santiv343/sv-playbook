import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContextError } from '../context/context.errors.js';
import { dispatchRun } from './gateway.js';
import { GATEWAY_LIFECYCLE_ERROR, GATEWAY_RUN_STATUS } from './gateway.constants.js';
import type { GatewayRuntime, WorkRunSpecRequest } from './gateway.types.js';
import { ADAPTER_RUN_STATE } from './gateway.types.js';
import { loadRunSnapshot } from './gateway-repository.js';
import { prepareRunSpec } from './run-spec.js';
import { REFERENCE_KIND } from '../platform.constants.js';
import { WORK_DEFINITION_INITIAL_VERSION } from '../tasks/work-definition.constants.js';
import { FakeAdapter, gatewayFixture as fixture } from './gateway.test-support.js';

const WORK_DEFINITION_REF = {
  kind: REFERENCE_KIND.WORK_DEFINITION,
  id: 'TASK-1',
  version: WORK_DEFINITION_INITIAL_VERSION,
} as const;
const TEST_OBSERVATION_INTERVAL_MS = 1;
const TEST_CEILING_MS = 100;
const TEST_CHURN_OBSERVATIONS = 200;
const TEST_CANDIDATE_OBSERVATIONS = 3;

function workRequest(): WorkRunSpecRequest {
  return { roleId: 'implementer', phase: 'delivery', workDefinitionRef: WORK_DEFINITION_REF, executionProfileId: 'fake-impl' };
}

test('a contract-valid candidate completes a run whose provider session never goes idle', async () => {
  const { root, store } = await fixture({ observationIntervalMs: TEST_OBSERVATION_INTERVAL_MS });
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  for (let index = 0; index < TEST_CANDIDATE_OBSERVATIONS; index += 1) {
    adapter.observations.push({
      adapterId: adapter.id, sessionId: 'session-1', messageId: 'message-1', state: 'running',
      progressToken: `provider-churn-${index}`, observedToolIds: [],
      candidateOutput: '{"ok":true}', evidence: { source: 'fake' },
    });
  }

  const receipt = await dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root);

  assert.deepEqual(receipt.completion.output, { ok: true });
  assert.equal(adapter.cancelled, true);
  assert.equal(adapter.observations.length, 2);
  assert.equal(loadRunSnapshot(store, runSpec.id)?.status, GATEWAY_RUN_STATUS.COMPLETED);
  store.close();
});

test('a non-conforming candidate keeps the run observing until terminal completion', async () => {
  const { root, store } = await fixture({ observationIntervalMs: TEST_OBSERVATION_INTERVAL_MS });
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  adapter.observations.push({
    adapterId: adapter.id, sessionId: 'session-1', messageId: 'message-1', state: 'running',
    progressToken: 'provider-churn', observedToolIds: [], candidateOutput: 'not json output', evidence: { source: 'fake' },
  });

  const receipt = await dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root);

  assert.deepEqual(receipt.completion.output, { ok: true });
  assert.equal(adapter.cancelled, false);
  assert.equal(loadRunSnapshot(store, runSpec.id)?.status, GATEWAY_RUN_STATUS.COMPLETED);
  store.close();
});

test('run duration ceiling cancels a run whose provider never stops making progress', async () => {
  const { root, store } = await fixture({
    observationIntervalMs: TEST_OBSERVATION_INTERVAL_MS,
    maxRunDurationMs: TEST_CEILING_MS,
  });
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  for (let index = 0; index < TEST_CHURN_OBSERVATIONS; index += 1) {
    adapter.observations.push({
      adapterId: adapter.id, sessionId: 'session-1', messageId: 'message-1', state: 'running',
      progressToken: `provider-churn-${index}`, observedToolIds: [], evidence: { source: 'fake' },
    });
  }
  let now = Date.now();
  const runtime: GatewayRuntime = {
    now: () => now,
    sleep: (delayMs) => { now += delayMs; return Promise.resolve(); },
  };

  await assert.rejects(
    dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root, runtime),
    (error: unknown) => error instanceof ContextError && error.code === GATEWAY_LIFECYCLE_ERROR.RUN_DURATION_EXCEEDED,
  );
  assert.equal(adapter.cancelled, true);
  assert.equal(loadRunSnapshot(store, runSpec.id)?.status, GATEWAY_RUN_STATUS.TIMED_OUT);
  store.close();
});

test('SC-013: an unknown adapter state fails the run immediately without waiting for progress timeout', async () => {
  const { root, store } = await fixture({ observationIntervalMs: TEST_OBSERVATION_INTERVAL_MS });
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  adapter.observations.push({
    adapterId: adapter.id, sessionId: 'session-1', messageId: 'message-1',
    state: ADAPTER_RUN_STATE.UNKNOWN,
    progressToken: 'unknown-progress', observedToolIds: [],
    evidence: { providerState: 'idle', deliveryState: 'pending' },
  });

  await assert.rejects(
    dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root),
    (error: unknown) => error instanceof ContextError,
  );
  assert.equal(loadRunSnapshot(store, runSpec.id)?.status, GATEWAY_RUN_STATUS.FAILED);
  store.close();
});
