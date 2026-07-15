import assert from 'node:assert/strict';
import test from 'node:test';
import { gatewayFixture } from './gateway.test-support.js';
import { cloneExecutionProfile } from './profiles.js';

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
