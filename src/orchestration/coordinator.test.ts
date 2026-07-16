import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORKFLOW_EXECUTOR, WORKFLOW_STATUS } from './orchestration.constants.js';
import { WorkflowCoordinator } from './coordinator.js';
import type {
  WorkflowCoordinatorConfig,
  WorkflowCoordinatorRuntime,
  WorkflowEffectFailure,
  WorkflowEffectExecutor,
  WorkflowFailureClassifier,
  WorkflowQueuePort,
} from './coordinator.types.js';
import type { WorkflowEffect, WorkflowSnapshot } from './service.types.js';

const TEST_FAILURE = {
  CODE: 'TEST_EXECUTION_FAILURE',
  DETAIL: 'execution failed in test',
} as const;

const EFFECT: WorkflowEffect = {
  id: 'EFF-1',
  workflowId: 'WF-1',
  stepKey: 'plan',
  executor: WORKFLOW_EXECUTOR.AGENT,
  roleId: 'planner',
  operationId: null,
  phase: 'planning',
  inputArtifactId: 'ART-1',
  inputContractRef: 'request-v1',
  input: { request: 'plan' },
  outputContractRef: 'plan-v1',
  requestedCapabilities: [],
  contextTags: [],
  contextReferences: [],
  attempt: 1,
  maxAttempts: 2,
  leaseOwner: 'coordinator-test',
  leaseExpiresAt: '2026-01-01T00:01:00.000Z',
};

const SNAPSHOT: WorkflowSnapshot = {
  id: EFFECT.workflowId,
  definitionId: 'delivery',
  definitionVersion: 1,
  subjectRef: 'project:test',
  status: WORKFLOW_STATUS.RUNNING,
  currentStepKey: EFFECT.stepKey,
  revision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CONFIG: WorkflowCoordinatorConfig = {
  workerId: 'coordinator-test',
  effectLeaseMs: 60_000,
  leaseRenewalIntervalMs: 20_000,
  idlePollIntervalMs: 1_000,
};

class FakeQueue implements WorkflowQueuePort {
  next: WorkflowEffect | undefined = EFFECT;
  completed: unknown;
  failed: WorkflowEffectFailure | undefined;
  renewals = 0;
  recoveries = 0;
  recoverOnNext = false;

  recoverExpired(): number {
    this.recoveries += 1;
    if (!this.recoverOnNext) return 0;
    this.recoverOnNext = false;
    this.next = EFFECT;
    return 1;
  }
  claim(): WorkflowEffect | undefined {
    const claimed = this.next;
    this.next = undefined;
    return claimed;
  }
  renew(): string {
    this.renewals += 1;
    return EFFECT.leaseExpiresAt;
  }
  complete(_effectId: string, _leaseOwner: string, output: unknown): WorkflowSnapshot {
    this.completed = output;
    return SNAPSHOT;
  }
  fail(_effectId: string, _leaseOwner: string, failure: WorkflowEffectFailure): WorkflowSnapshot {
    this.failed = failure;
    return SNAPSHOT;
  }
}

const FAILURE_CLASSIFIER: WorkflowFailureClassifier = {
  classify: () => ({ code: TEST_FAILURE.CODE, detail: TEST_FAILURE.DETAIL, retryable: true }),
};

function runtime(wait: (delayMs: number) => Promise<void>): WorkflowCoordinatorRuntime {
  return { now: () => new Date('2026-01-01T00:00:00.000Z'), wait };
}

test('the coordinator completes a claimed effect through its registered executor', async () => {
  const queue = new FakeQueue();
  const output = { plan: 'bounded' };
  const executor: WorkflowEffectExecutor = { execute: () => Promise.resolve(output) };
  const coordinator = new WorkflowCoordinator(
    queue,
    new Map([[WORKFLOW_EXECUTOR.AGENT, executor]]),
    FAILURE_CLASSIFIER,
    CONFIG,
    runtime(() => new Promise(() => undefined)),
  );
  assert.equal(await coordinator.runOne(), true);
  assert.deepEqual(queue.completed, output);
  assert.equal(queue.failed, undefined);
});

test('the coordinator classifies executor failures before asking the queue to retry', async () => {
  const queue = new FakeQueue();
  const executor: WorkflowEffectExecutor = { execute: () => Promise.reject(new Error(TEST_FAILURE.DETAIL)) };
  const coordinator = new WorkflowCoordinator(
    queue,
    new Map([[WORKFLOW_EXECUTOR.AGENT, executor]]),
    FAILURE_CLASSIFIER,
    CONFIG,
    runtime(() => new Promise(() => undefined)),
  );
  assert.equal(await coordinator.runOne(), true);
  assert.deepEqual(queue.failed, { code: TEST_FAILURE.CODE, detail: TEST_FAILURE.DETAIL, retryable: true });
  assert.equal(queue.completed, undefined);
});

test('the coordinator fails a claimed effect when its executor is unavailable', async () => {
  const queue = new FakeQueue();
  const coordinator = new WorkflowCoordinator(
    queue,
    new Map(),
    FAILURE_CLASSIFIER,
    CONFIG,
    runtime(() => new Promise(() => undefined)),
  );
  assert.equal(await coordinator.runOne(), true);
  assert.deepEqual(queue.failed, { code: TEST_FAILURE.CODE, detail: TEST_FAILURE.DETAIL, retryable: true });
  assert.equal(queue.completed, undefined);
});

test('the coordinator renews the lease while a long-running executor remains active', async () => {
  const queue = new FakeQueue();
  let finishExecution: ((output: unknown) => void) | undefined;
  let finishWait: (() => void) | undefined;
  const executor: WorkflowEffectExecutor = {
    execute: () => new Promise((resolve) => { finishExecution = resolve; }),
  };
  const coordinator = new WorkflowCoordinator(
    queue,
    new Map([[WORKFLOW_EXECUTOR.AGENT, executor]]),
    FAILURE_CLASSIFIER,
    CONFIG,
    runtime(() => new Promise((resolve) => { finishWait = resolve; })),
  );
  const running = coordinator.runOne();
  finishWait?.();
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(queue.renewals, 1);
  finishExecution?.({ plan: 'eventually complete' });
  assert.equal(await running, true);
});

test('the coordinator recovers newly expired effects before every claim cycle', async () => {
  const queue = new FakeQueue();
  queue.next = undefined;
  queue.recoverOnNext = true;
  const executor: WorkflowEffectExecutor = { execute: () => Promise.resolve({ plan: 'recovered' }) };
  const coordinator = new WorkflowCoordinator(
    queue,
    new Map([[WORKFLOW_EXECUTOR.AGENT, executor]]),
    FAILURE_CLASSIFIER,
    CONFIG,
    runtime(() => new Promise(() => undefined)),
  );
  assert.equal(await coordinator.runOne(), true);
  assert.equal(queue.recoveries, 1);
  assert.deepEqual(queue.completed, { plan: 'recovered' });
});
