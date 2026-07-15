import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { SERVE_ROUTE } from '../cli/commands/serve.constants.js';
import { gatewayFixture } from '../gateway/gateway.test-support.js';
import { prepareRunSpec } from '../gateway/run-spec.js';
import type { WorkRunSpecRequest } from '../gateway/gateway.types.js';
import { createOperationalServer } from './server.js';
import { HTTP_STATUS, REFERENCE_KIND } from '../platform.constants.js';
import { WORK_DEFINITION_INITIAL_VERSION } from '../tasks/work-definition.constants.js';

const REQUEST: WorkRunSpecRequest = {
  roleId: 'implementer',
  phase: 'delivery',
  workDefinitionRef: {
    kind: REFERENCE_KIND.WORK_DEFINITION,
    id: 'TASK-1',
    version: WORK_DEFINITION_INITIAL_VERSION,
  },
  executionProfileId: 'fake-impl',
};

test('Serve and the runtime capability prepare the same semantic RunSpec', async () => {
  const { root, store } = await gatewayFixture();
  const expected = prepareRunSpec(store, REQUEST);
  const server = createOperationalServer(store, root, { refreshMs: 60_000 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');

  const response = await fetch(`http://127.0.0.1:${address.port}${SERVE_ROUTE.DISPATCH_PREPARE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(REQUEST),
  });
  const actual: unknown = await response.json();

  assert.equal(response.status, HTTP_STATUS.CREATED);
  assert.equal(typeof actual === 'object' && actual !== null ? Reflect.get(actual, 'specDigest') : undefined, expected.specDigest);
  assert.equal(typeof actual === 'object' && actual !== null ? Reflect.get(actual, 'id') : undefined, expected.id);
  server.close();
  await once(server, 'close');
  store.close();
});
