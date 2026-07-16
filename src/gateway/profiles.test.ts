import assert from 'node:assert/strict';
import test from 'node:test';
import { ContextError } from '../context/context.errors.js';
import { EXECUTION_PROFILE_ERROR } from './gateway.constants.js';
import { gatewayFixture } from './gateway.test-support.js';
import {
  cloneExecutionProfile,
  executionProfileSnapshotJson,
  loadExecutionProfile,
  parseExecutionProfileSnapshot,
} from './profiles.js';

test('cloneExecutionProfile inherits provider-neutral settings and applies explicit overrides', async () => {
  const { store } = await gatewayFixture();

  const cloned = cloneExecutionProfile(store, {
    sourceProfileId: 'fake-impl', id: 'implementer-clone', roleId: 'implementer', agentId: 'implementer-clone',
    tools: { bash: true },
  });

  assert.equal(cloned.adapterId, 'fake');
  assert.equal(cloned.providerId, 'provider');
  assert.equal(cloned.modelId, 'model');
  assert.deepEqual(cloned.adapterConfig, { endpoint: 'fake' });
  assert.deepEqual(cloned.tools, { bash: true, read: true });
  store.close();
});

test('execution profile snapshot round-trips maxRunDurationMs and rejects a non-positive ceiling', async () => {
  const { store } = await gatewayFixture();

  const profile = loadExecutionProfile(store, 'fake-impl');
  assert.equal(profile.maxRunDurationMs, undefined);
  const parsed = parseExecutionProfileSnapshot(executionProfileSnapshotJson({ ...profile, maxRunDurationMs: 120_000 }));
  assert.equal(parsed.maxRunDurationMs, 120_000);
  assert.throws(
    () => parseExecutionProfileSnapshot(executionProfileSnapshotJson({ ...profile, maxRunDurationMs: 0 })),
    (error: unknown) => error instanceof ContextError && error.code === EXECUTION_PROFILE_ERROR.INVALID,
  );
  store.close();
});
