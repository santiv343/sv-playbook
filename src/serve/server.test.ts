import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { SERVE_ROUTE } from '../cli/commands/serve.constants.js';
import { gatewayFixture } from '../gateway/gateway.test-support.js';
import { prepareRunSpec } from '../gateway/run-spec.js';
import type { WorkRunSpecRequest } from '../gateway/gateway.types.js';
import { createOperationalServer } from './server.js';
import { registerWorkflowDefinition, startWorkflow } from '../orchestration/service.js';
import { readWorkflowLaunchCatalog } from '../orchestration/launch-catalog.js';
import { WORKFLOW_EXECUTOR } from '../orchestration/orchestration.constants.js';
import { HTTP_STATUS, REFERENCE_KIND } from '../platform.constants.js';
import { WORK_DEFINITION_INITIAL_VERSION } from '../tasks/work-definition.constants.js';

const MIN_NEW_EVENTS_ON_INCREMENTAL_TICK = 0;
const FULL_HISTORY_REPLAY_THRESHOLD = 50;

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

test('Serve resuelve archivos estáticos reales del directorio de build, no una tabla fija', async () => {
  const { root, store } = await gatewayFixture();
  const server = createOperationalServer(store, root, { refreshMs: 60_000 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');

  const response = await fetch(`http://127.0.0.1:${address.port}/assets/index.html`);
  assert.equal(response.status, HTTP_STATUS.OK);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');

  const traversal = await fetch(`http://127.0.0.1:${address.port}/assets/../../../etc/passwd`);
  assert.equal(traversal.status, HTTP_STATUS.NOT_FOUND);

  server.close();
  await once(server, 'close');
  store.close();
});

const TEST_WORKFLOW_ID = 'sse-test-workflow';
const TEST_WORKFLOW_STEP = 'agent';
const TEST_CONTRACT_REF = 'task-v1';

test('El push SSE es incremental: el segundo tick no reenvía eventos ya vistos por ese cliente', async () => {
  const { root, store } = await gatewayFixture();
  registerWorkflowDefinition(store, {
    id: TEST_WORKFLOW_ID,
    startStepKey: TEST_WORKFLOW_STEP,
    steps: [{
      key: TEST_WORKFLOW_STEP,
      executor: WORKFLOW_EXECUTOR.AGENT,
      roleId: 'implementer',
      phase: 'delivery',
      inputContractRef: TEST_CONTRACT_REF,
      outputContractRef: 'report-v1',
      maxAttempts: 2,
      requestedCapabilities: ['artifact.read'],
    }],
    routes: [{ fromStepKey: TEST_WORKFLOW_STEP, priority: 0 }],
  });
  const server = createOperationalServer(store, root, { refreshMs: 500 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');

  const controller = new AbortController();
  const streamResponse = await fetch(`http://127.0.0.1:${address.port}${SERVE_ROUTE.EVENTS}`, { signal: controller.signal });
  const reader = streamResponse.body?.getReader();
  assert.ok(reader);
  const decoder = new TextDecoder();
  let buffer = '';

  const readTick = async (): Promise<unknown> => {
    for (;;) {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      buffer += decoder.decode(value, { stream: true });
      const match = buffer.match(/data: (.*)\n\n/);
      if (match?.[1]) {
        buffer = buffer.slice((match.index ?? 0) + match[0].length);
        return JSON.parse(match[1]);
      }
    }
  };

  const first = await readTick();
  assert.ok(typeof first === 'object' && first !== null);

  const catalog = readWorkflowLaunchCatalog(store);
  const definition = catalog[0];
  assert.ok(definition);
  startWorkflow(store, {
    definitionId: definition.id,
    definitionVersion: definition.version,
    subjectRef: 'TEST-SUBJECT',
    requestedBy: 'test',
    inputContractRef: definition.inputContractRef,
    input: { task: 'Implement the bounded change' },
  });

  const second = await readTick();
  controller.abort();
  server.close();
  await once(server, 'close');
  assert.ok(typeof second === 'object' && second !== null);
  const secondWorkflow: unknown = Reflect.get(second, 'workflow');
  assert.ok(typeof secondWorkflow === 'object' && secondWorkflow !== null);
  const secondEvents: unknown = Reflect.get(secondWorkflow, 'events');
  assert.ok(Array.isArray(secondEvents));
  assert.ok(secondEvents.length > MIN_NEW_EVENTS_ON_INCREMENTAL_TICK, 'el segundo tick debe traer al menos el evento nuevo del workflow recién creado');
  assert.ok(secondEvents.length < FULL_HISTORY_REPLAY_THRESHOLD, 'el segundo tick NO debe reenviar el historial completo desde seq 0');
  store.close();
});
