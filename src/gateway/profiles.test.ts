import assert from 'node:assert/strict';
import test from 'node:test';
import { ContextError } from '../context/context.errors.js';
import { EXECUTION_PROFILE_ERROR } from './gateway.constants.js';
import { gatewayFixture } from './gateway.test-support.js';
import {
  cloneExecutionProfile,
  executionProfileSnapshotJson,
  listExecutionProfiles,
  loadExecutionProfile,
  parseExecutionProfileSnapshot,
  removeExecutionProfile,
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

test('removeExecutionProfile deletes the profile and its tool policy, and rejects removing an unknown id', async () => {
  const { store } = await gatewayFixture();
  const cloned = cloneExecutionProfile(store, {
    sourceProfileId: 'fake-impl', id: 'implementer-throwaway', roleId: 'implementer', agentId: 'implementer-throwaway',
    tools: { bash: true },
  });
  assert.ok(listExecutionProfiles(store).some((profile) => profile.id === cloned.id));

  removeExecutionProfile(store, cloned.id);

  assert.ok(!listExecutionProfiles(store).some((profile) => profile.id === cloned.id));
  assert.throws(
    () => loadExecutionProfile(store, cloned.id),
    (error: unknown) => error instanceof ContextError && error.code === EXECUTION_PROFILE_ERROR.UNKNOWN,
  );
  assert.throws(
    () => { removeExecutionProfile(store, cloned.id); },
    (error: unknown) => error instanceof ContextError && error.code === EXECUTION_PROFILE_ERROR.UNKNOWN,
  );
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
