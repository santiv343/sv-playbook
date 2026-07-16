import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addArtifactContract } from '../contracts/artifacts.js';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { addContextItem, replaceContextPrecedence } from '../context/repository.js';
import { openStore } from '../db/store.js';
import { stringColumn } from '../db/rows.js';
import { addResponsibility, addRoleContract } from '../roles/catalog.js';
import { WORKFLOW_EXECUTOR, WORKFLOW_STATUS } from '../orchestration/orchestration.constants.js';
import { claimWorkflowEffect, failWorkflowEffect, registerWorkflowDefinition, startWorkflow } from '../orchestration/service.js';
import type {
  AdapterCancellationReceipt, AdapterObservationRequest, AdapterProfileReceipt, AdapterRunObservation,
  AdapterSessionReceipt, AdapterTurnReceipt, AgentAdapter,
} from './gateway.types.js';
import { GATEWAY_OPERATION, GATEWAY_RUN_STATUS } from './gateway.constants.js';
import { acceptSession, acceptTurn, commitIntent } from './gateway-repository.js';
import { reconcileOrphanedGatewayRuns } from './gateway-recovery.js';
import { addExecutionProfile } from './profiles.js';
import { gatewayRunState } from './schema.constants.js';
import { prepareWorkflowRunSpec } from './run-spec.js';

class CancellationAdapter implements AgentAdapter {
  readonly id = 'cancellation-adapter';
  cancellations = 0;
  verifyProfile(): Promise<AdapterProfileReceipt> { return Promise.reject(new Error('not used')); }
  createSession(): Promise<AdapterSessionReceipt> { return Promise.reject(new Error('not used')); }
  submitTurn(): Promise<AdapterTurnReceipt> { return Promise.reject(new Error('not used')); }
  observeRun(): Promise<AdapterRunObservation> { return Promise.reject(new Error('not used')); }
  cancelRun(request: AdapterObservationRequest): Promise<AdapterCancellationReceipt> {
    this.cancellations += 1;
    return Promise.resolve({
      adapterId: this.id, sessionId: request.sessionId, messageId: request.messageId,
      acknowledged: true, evidence: { source: 'test' },
    });
  }
}

function configureRole(store: ReturnType<typeof openStore>, adapter: CancellationAdapter): void {
  replaceContextPrecedence(store, ['role']);
  addContextItem(store, {
    id: 'ROLE-RECOVERY', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.recovery', body: 'Execute one bounded task.',
    provenance: 'test', selectors: { role: ['implementer'] },
  });
  addResponsibility(store, { id: 'candidate.implement', classification: 'semantic', description: 'Implement.' });
  for (const ref of ['input-v1', 'output-v1']) {
    addArtifactContract(store, {
      ref, status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' },
    });
  }
  addRoleContract(store, {
    roleId: 'implementer', mission: 'Implement bounded work.', contextItemRef: 'ROLE-RECOVERY@1', inputContractRef: 'input-v1',
    outputContractRef: 'output-v1', minimumModelCapability: 'implementation',
    exclusiveJudgments: ['candidate.implement'], capabilityRequestClasses: [],
  });
  addExecutionProfile(store, {
    id: 'recovery-profile', roleId: 'implementer', adapterId: adapter.id, agentId: 'implementer',
    providerId: 'provider', modelId: 'model', adapterConfig: {}, observationIntervalMs: 1,
    noProgressTimeoutMs: 600_000, cancellationGraceMs: 10_000, tools: { read: false }, enabled: true,
  });
}

async function fixture(workflowStatus: typeof WORKFLOW_STATUS.RUNNING | typeof WORKFLOW_STATUS.FAILED) {
  const root = await mkdtemp(join(tmpdir(), 'svp-gateway-recovery-'));
  const store = openStore(root);
  const adapter = new CancellationAdapter();
  configureRole(store, adapter);
  registerWorkflowDefinition(store, {
    id: 'recovery', startStepKey: 'step',
    steps: [{
      key: 'step', executor: WORKFLOW_EXECUTOR.AGENT, roleId: 'implementer', phase: 'delivery',
      inputContractRef: 'input-v1', outputContractRef: 'output-v1', maxAttempts: 1,
    }],
    routes: [{ fromStepKey: 'step', priority: 0 }],
  });
  startWorkflow(store, {
    definitionId: 'recovery', subjectRef: 'subject', requestedBy: 'test', inputContractRef: 'input-v1', input: {},
  });
  const effect = claimWorkflowEffect(store, 'worker', 60_000);
  assert.ok(effect);
  const runSpec = prepareWorkflowRunSpec(store, effect);
  if (workflowStatus === WORKFLOW_STATUS.FAILED) {
    failWorkflowEffect(store, {
      effectId: effect.id, leaseOwner: effect.leaseOwner, failureCode: 'TEST_FAILURE', failureDetail: 'terminal', retryable: false,
    });
  }
  const createIntent = commitIntent(store, runSpec, GATEWAY_OPERATION.CREATE_SESSION);
  acceptSession(store, runSpec, createIntent.id, {
    adapterId: adapter.id, sessionId: 'session', profileDigest: 'sha256:profile', sessionReceipt: {},
  });
  const turnIntent = commitIntent(store, runSpec, GATEWAY_OPERATION.SUBMIT_TURN, 1);
  acceptTurn(store, runSpec, 1, turnIntent.id, {
    adapterId: adapter.id, sessionId: 'session', messageId: 'message', submissionReceipt: {},
  });
  const now = new Date().toISOString();
  store.orm.insert(gatewayRunState).values({
    runSpecId: runSpec.id, adapterSessionId: 'session', messageId: 'message',
    status: GATEWAY_RUN_STATUS.OBSERVING, progressToken: 'working', observedToolIdsJson: '[]',
    lastObservedAt: now, lastProgressAt: now, updatedAt: now,
  }).run();
  return { adapter, root, store };
}

test('startup recovery cancels an observing run whose workflow effect is terminal', async () => {
  const { adapter, root, store } = await fixture(WORKFLOW_STATUS.FAILED);
  assert.equal(await reconcileOrphanedGatewayRuns(store, new Map([[adapter.id, adapter]]), root), 1);
  assert.equal(adapter.cancellations, 1);
  assert.equal(stringColumn(store.db.prepare('SELECT status FROM gateway_run_state').get(), 'status'),
    GATEWAY_RUN_STATUS.CANCELLED);
  store.close();
});

test('startup recovery preserves an observing run with an active workflow effect', async () => {
  const { adapter, root, store } = await fixture(WORKFLOW_STATUS.RUNNING);
  assert.equal(await reconcileOrphanedGatewayRuns(store, new Map([[adapter.id, adapter]]), root), 0);
  assert.equal(adapter.cancellations, 0);
  assert.equal(stringColumn(store.db.prepare('SELECT status FROM gateway_run_state').get(), 'status'),
    GATEWAY_RUN_STATUS.OBSERVING);
  store.close();
});
