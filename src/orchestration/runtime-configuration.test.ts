import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ContextError } from '../context/context.errors.js';
import { openStore } from '../db/store.js';
import {
  loadWorkflowCoordinatorConfig,
  setWorkflowCoordinatorTiming,
  setWorkflowFailurePolicy,
  StoreWorkflowFailureClassifier,
} from './runtime-configuration.js';

const TEST_ERROR = 'TEST_RETRYABLE_ERROR';

test('coordinator timing is loaded from durable configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-coordinator-config-'));
  const store = openStore(root);
  setWorkflowCoordinatorTiming(store, {
    effectLeaseMs: 90_000,
    leaseRenewalIntervalMs: 30_000,
    idlePollIntervalMs: 750,
  });
  assert.deepEqual(loadWorkflowCoordinatorConfig(store, 'worker-test'), {
    workerId: 'worker-test',
    effectLeaseMs: 90_000,
    leaseRenewalIntervalMs: 30_000,
    idlePollIntervalMs: 750,
  });
  store.close();
});

test('failure retryability is data-driven and unknown failures fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-failure-policy-'));
  const store = openStore(root);
  const classifier = new StoreWorkflowFailureClassifier(store);
  assert.equal(classifier.classify(new ContextError(TEST_ERROR, 'temporary')).retryable, false);
  setWorkflowFailurePolicy(store, TEST_ERROR, true);
  assert.equal(classifier.classify(new ContextError(TEST_ERROR, 'temporary')).retryable, true);
  store.close();
});
