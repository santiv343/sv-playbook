import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { addArtifactContract } from '../contracts/artifacts.js';
import { CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { addContextItem, replaceContextPrecedence } from '../context/repository.js';
import { openStore } from '../db/store.js';
import { addResponsibility, addRoleContract } from '../roles/catalog.js';
import { HUMAN_INTAKE_CONTRACT } from './human-intake.constants.js';
import { startHumanIntake } from './human-intake.js';
import { readWorkflowDashboard } from './observability.js';
import { WORKFLOW_EXECUTOR, WORKFLOW_STATUS } from './orchestration.constants.js';
import { claimWorkflowEffect, registerWorkflowDefinition } from './service.js';

const TEST_ENTRY_ROLE = 'custom-intake-interface';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'svp-human-intake-'));
  const store = openStore(root);
  replaceContextPrecedence(store, ['role']);
  addContextItem(store, {
    id: 'ROLE-HUMAN-INTERFACE', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.human-interface', body: 'Clarify intent.',
    provenance: 'test', selectors: { role: [TEST_ENTRY_ROLE] },
  });
  addResponsibility(store, { id: 'intent.clarify', classification: 'semantic', description: 'Clarify intent.' });
  addArtifactContract(store, {
    ref: HUMAN_INTAKE_CONTRACT.MESSAGE_RUN_STATUS_V1,
    status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
      required: ['provenance', 'message_text', 'run_status_narrative', 'preliminary_request_classification'],
      properties: {
        provenance: { type: 'object' },
        message_text: { type: 'string', minLength: 1 },
        run_status_narrative: { type: 'string', minLength: 1 },
        preliminary_request_classification: { type: ['string', 'null'] },
      },
    },
  });
  addArtifactContract(store, {
    ref: 'intent-v1', status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' },
  });
  addRoleContract(store, {
    roleId: TEST_ENTRY_ROLE,
    mission: 'Clarify human intent.',
    contextItemRef: 'ROLE-HUMAN-INTERFACE@1',
    inputContractRef: HUMAN_INTAKE_CONTRACT.MESSAGE_RUN_STATUS_V1,
    outputContractRef: 'intent-v1',
    minimumModelCapability: 'reasoning',
    exclusiveJudgments: ['intent.clarify'],
    capabilityRequestClasses: [],
  });
  registerWorkflowDefinition(store, {
    id: 'intake', startStepKey: 'clarify',
    steps: [{
      key: 'clarify', executor: WORKFLOW_EXECUTOR.AGENT, roleId: TEST_ENTRY_ROLE,
      phase: 'intent-clarification', inputContractRef: HUMAN_INTAKE_CONTRACT.MESSAGE_RUN_STATUS_V1,
      outputContractRef: 'intent-v1', maxAttempts: 1,
    }],
    routes: [{ fromStepKey: 'clarify', priority: 0 }],
  });
  return store;
}

test('human intake uses the active typed entry workflow without a bundled role id', async () => {
  const store = await fixture();
  const observedAt = '2026-07-14T10:00:00.000Z';
  const started = startHumanIntake(store, { message: '  Continue the project  ', requestedBy: 'human:test' }, {
    observedAt,
    board: {
      counts: { ready: 2 }, packets: [],
      backup: {
        ageHours: undefined, stale: false, verified: true, failed: false, failedCycles: 0,
        terminalPacketCount: undefined, liveTerminalPacketCount: undefined, terminalCountRegressed: false,
      },
    },
    workflow: readWorkflowDashboard(store),
  });
  assert.equal(started.status, WORKFLOW_STATUS.RUNNING);
  assert.equal(started.requestedBy, 'human:test');
  const effect = claimWorkflowEffect(store, 'worker', 60_000);
  assert.ok(effect);
  assert.ok(isRecord(effect.input));
  assert.equal(effect.input.message_text, 'Continue the project');
  assert.ok(isRecord(effect.input.provenance));
  assert.equal(effect.input.provenance.timestamp, observedAt);
  assert.equal(effect.input.preliminary_request_classification, null);
  const status: unknown = JSON.parse(String(effect.input.run_status_narrative));
  assert.ok(isRecord(status));
  assert.deepEqual(status.taskCounts, { ready: 2 });
  store.close();
});
