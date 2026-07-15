import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { addArtifactContract } from '../contracts/artifacts.js';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { ContextError } from '../context/context.errors.js';
import { openStore } from '../db/store.js';
import { WORKFLOW_EXECUTOR, WORKFLOW_RUNTIME_ERROR } from './orchestration.constants.js';
import { registerWorkflowDefinition } from './service.js';
import { validateWorkflowRuntimeBindings } from './runtime-validation.js';

const CONTRACT = { INPUT: 'runtime-input-v1', OUTPUT: 'runtime-output-v1' } as const;
const OPERATION_ID = 'test.echo';

test('startup validation rejects an unregistered deterministic operation before claiming work', async () => {
  const store = openStore(await mkdtemp(join(tmpdir(), 'svp-runtime-validation-')));
  for (const ref of [CONTRACT.INPUT, CONTRACT.OUTPUT]) {
    addArtifactContract(store, {
      ref,
      status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
      schema: { type: 'object', additionalProperties: true },
    });
  }
  registerWorkflowDefinition(store, {
    id: 'runtime-validation', startStepKey: 'echo',
    steps: [{
      key: 'echo', executor: WORKFLOW_EXECUTOR.RUNTIME, operationId: OPERATION_ID, phase: 'runtime',
      inputContractRef: CONTRACT.INPUT, outputContractRef: CONTRACT.OUTPUT, maxAttempts: 1,
    }],
    routes: [{ fromStepKey: 'echo', priority: 0 }],
  });

  assert.throws(
    () => { validateWorkflowRuntimeBindings(store, new Map(), new Map()); },
    (error: unknown) => error instanceof ContextError && error.code === WORKFLOW_RUNTIME_ERROR.OPERATION_UNAVAILABLE,
  );
  assert.doesNotThrow(() => {
    validateWorkflowRuntimeBindings(store, new Map(), new Map([[
      OPERATION_ID,
      { execute: (input: unknown) => Promise.resolve(input) },
    ]]));
  });
  store.close();
});
