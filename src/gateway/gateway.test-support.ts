import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { addArtifactContract } from '../contracts/artifacts.js';
import { CAPABILITY_EFFECT, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { addContextItem, replaceContextPrecedence } from '../context/repository.js';
import { openStore } from '../db/store.js';
import type { Store } from '../db/store.types.js';
import {
  addModelCapability,
  addResponsibility,
  addRoleContract,
  addRoleHandoff,
  requireRole,
  setRoleCatalogProfile,
  setRolePolicy,
} from '../roles/catalog.js';
import { activateRoleCatalog } from '../roles/catalog-activation.js';
import { addModelCapabilityEvidence } from '../roles/model-capability-evidence.js';
import { RESPONSIBILITY_CLASSIFICATION, SELF_CORRECTION_MODE } from '../roles/role.constants.js';
import { ROLE_CATALOG_PROFILE_SOURCE } from '../roles/catalog.constants.js';
import type {
  AdapterCancellationReceipt,
  AdapterObservationRequest,
  AdapterOperationRequest,
  AdapterProfileReceipt,
  AdapterRunObservation,
  AdapterSessionReceipt,
  AdapterTurnReceipt,
  AdapterTurnRequest,
  AgentAdapter,
} from './gateway.types.js';
import { addExecutionProfile } from './profiles.js';
import { createPacket } from '../tasks/service.js';
import { claimWorkflowEffect, registerWorkflowDefinition, startWorkflow } from '../orchestration/service.js';
import { WORKFLOW_EXECUTOR } from '../orchestration/orchestration.constants.js';
import type { WorkflowEffect } from '../orchestration/service.types.js';

const IMPLEMENT_RESPONSIBILITY_ID = 'candidate.implement';
const ARTIFACT_READ_CAPABILITY = 'artifact.read';
const CONSUME_RESPONSIBILITY_ID = 'candidate.consume';
const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const TEST_WORKFLOW_STEP = 'agent';
const TEST_ROLE_ID = 'implementer';
const TEST_CONSUMER_ROLE_ID = 'result-consumer';
const TEST_MODEL_EVIDENCE_DIGEST = `sha256:${'a'.repeat(64)}`;
const TEST_MODEL_EVIDENCE_ASSESSED_AT = '2026-01-01T00:00:00.000Z';
const TEST_MODEL_EVIDENCE_EXPIRES_AT = '2100-01-01T00:00:00.000Z';
const ROLE_SEMANTIC_KEY = 'role.charter';
const TASK_CONTRACT_REF = 'task-v1';
const REPORT_CONTRACT_REF = 'report-v1';
const IMPLEMENTATION_CAPABILITY_ID = 'implementation';
const RESULT_CONSUMPTION_CAPABILITY_ID = 'result-consumption';
const TEST_PROVIDER_ID = 'provider';
const TEST_MODEL_ID = 'model';
const TEST_WORKFLOW_ID = 'gateway-test-workflow';
const DEFAULT_OBSERVATION_INTERVAL_MS = 1;
const DEFAULT_NO_PROGRESS_TIMEOUT_MS = 600_000;
const DEFAULT_CANCELLATION_GRACE_MS = 10_000;

interface GatewayFixtureOptions {
  readonly observationIntervalMs?: number;
  readonly noProgressTimeoutMs?: number;
  readonly cancellationGraceMs?: number;
  readonly maxRunDurationMs?: number;
  readonly activateCatalog?: boolean;
  readonly seedModelEvidence?: boolean;
}

export class FakeAdapter implements AgentAdapter {
  readonly id = 'fake';
  turnRequest: AdapterTurnRequest | undefined;
  observations: AdapterRunObservation[] = [];
  cancelled = false;
  verifyProfileCount = 0;
  sessionCreateCount = 0;
  turnSubmitCount = 0;
  turnError: Error | undefined;
  // Adapter identities are globally unique in the real world; tests that drive
  // several runs through one store set a suffix to keep that invariant.
  idSuffix = '';

  verifyProfile(): Promise<AdapterProfileReceipt> {
    this.verifyProfileCount += 1;
    return Promise.resolve({ adapterId: this.id, profileDigest: 'sha256:profile', evidence: { verified: true } });
  }

  createSession(_request: AdapterOperationRequest, profile: AdapterProfileReceipt): Promise<AdapterSessionReceipt> {
    this.sessionCreateCount += 1;
    return Promise.resolve({
      adapterId: this.id,
      sessionId: `session-1${this.idSuffix}`,
      profileDigest: profile.profileDigest,
      sessionReceipt: { status: 'confirmed' },
    });
  }

  submitTurn(request: AdapterTurnRequest): Promise<AdapterTurnReceipt> {
    this.turnSubmitCount += 1;
    if (this.turnError !== undefined) return Promise.reject(this.turnError);
    this.turnRequest = request;
    return Promise.resolve({
      adapterId: this.id, sessionId: request.sessionId, messageId: `message-1${this.idSuffix}`,
      submissionReceipt: { deliveryStatus: 'observed' },
    });
  }

  observeRun(request: AdapterObservationRequest): Promise<AdapterRunObservation> {
    const next = this.observations.shift();
    return Promise.resolve(next ?? {
      adapterId: this.id, sessionId: request.sessionId, messageId: request.messageId,
      state: this.cancelled ? 'cancelled' : 'completed', progressToken: this.cancelled ? 'cancelled' : 'completed',
      observedToolIds: [], output: '{"ok":true}', evidence: { source: 'fake' },
    });
  }

  cancelRun(request: AdapterObservationRequest): Promise<AdapterCancellationReceipt> {
    this.cancelled = true;
    return Promise.resolve({
      adapterId: this.id, sessionId: request.sessionId, messageId: request.messageId,
      acknowledged: true, evidence: { source: 'fake' },
    });
  }
}

function seedGatewayContext(store: Store, root: string): void {
  replaceContextPrecedence(store, ['role', 'task']);
  addContextItem(store, {
    id: 'ROLE-IMPL', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: ROLE_SEMANTIC_KEY, body: 'Implement one task.',
    provenance: 'test', selectors: { role: [TEST_ROLE_ID] }, capabilities: { [ARTIFACT_READ_CAPABILITY]: CAPABILITY_EFFECT.ALLOW },
  });
  addContextItem(store, {
    id: 'ROLE-CONSUMER', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: ROLE_SEMANTIC_KEY, body: 'Consume one result.',
    provenance: 'test', selectors: { role: [TEST_CONSUMER_ROLE_ID] },
  });
  createPacket(store, root, {
    id: 'TASK-1', title: 'Return a bounded result', dependsOn: [], writeSet: ['src/**'],
    requirements: ['Return a bounded result.'], evidenceRequired: [], tags: ['frontend'],
  }, 'Implement the bounded task.');
}

function seedGatewayContracts(store: Store): void {
  addArtifactContract(store, {
    ref: TASK_CONTRACT_REF, status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    schema: {
      $schema: JSON_SCHEMA_DRAFT, type: 'object', required: ['task'],
      properties: { task: { type: 'string' } }, additionalProperties: false,
    },
  });
  addArtifactContract(store, {
    ref: REPORT_CONTRACT_REF, status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    schema: { $schema: JSON_SCHEMA_DRAFT, type: 'object' },
  });
}

function seedGatewayRoles(store: Store): void {
  addModelCapability(store, { id: IMPLEMENTATION_CAPABILITY_ID, description: 'Can implement a bounded change.' });
  addModelCapability(store, { id: RESULT_CONSUMPTION_CAPABILITY_ID, description: 'Can consume a bounded result.' });
  addResponsibility(store, {
    id: IMPLEMENT_RESPONSIBILITY_ID, classification: RESPONSIBILITY_CLASSIFICATION.SEMANTIC, description: 'Implement.',
  });
  addResponsibility(store, {
    id: CONSUME_RESPONSIBILITY_ID, classification: RESPONSIBILITY_CLASSIFICATION.SEMANTIC, description: 'Consume.',
  });
  addRoleContract(store, {
    roleId: TEST_ROLE_ID, mission: 'Implement bounded work.', contextItemRef: 'ROLE-IMPL@1', inputContractRef: TASK_CONTRACT_REF,
    outputContractRef: REPORT_CONTRACT_REF, minimumModelCapability: IMPLEMENTATION_CAPABILITY_ID,
    exclusiveJudgments: [IMPLEMENT_RESPONSIBILITY_ID], capabilityRequestClasses: [ARTIFACT_READ_CAPABILITY],
  });
  addRoleContract(store, {
    roleId: TEST_CONSUMER_ROLE_ID, mission: 'Consume bounded results.', contextItemRef: 'ROLE-CONSUMER@1', inputContractRef: REPORT_CONTRACT_REF,
    outputContractRef: TASK_CONTRACT_REF, minimumModelCapability: RESULT_CONSUMPTION_CAPABILITY_ID,
    exclusiveJudgments: [CONSUME_RESPONSIBILITY_ID], capabilityRequestClasses: [],
  });
  addRoleHandoff(store, {
    sourceRoleId: TEST_ROLE_ID, targetRoleId: TEST_CONSUMER_ROLE_ID, artifactContractRef: REPORT_CONTRACT_REF,
  });
  addRoleHandoff(store, {
    sourceRoleId: TEST_CONSUMER_ROLE_ID, targetRoleId: TEST_ROLE_ID, artifactContractRef: TASK_CONTRACT_REF,
  });
  setRolePolicy(store, {
    roleId: TEST_ROLE_ID, prohibitions: ['candidate.review'], selfCorrectionMode: SELF_CORRECTION_MODE.BOUNDED,
    selfCorrectionScopes: [REPORT_CONTRACT_REF], stopConditions: ['scope-change-required'],
    escalationClasses: ['authority-gap'],
  });
  setRolePolicy(store, {
    roleId: TEST_CONSUMER_ROLE_ID, prohibitions: ['candidate.modify'], selfCorrectionMode: SELF_CORRECTION_MODE.BOUNDED,
    selfCorrectionScopes: [TASK_CONTRACT_REF], stopConditions: ['invalid-result'], escalationClasses: ['result-gap'],
  });
  requireRole(store, TEST_ROLE_ID);
  requireRole(store, TEST_CONSUMER_ROLE_ID);
  setRoleCatalogProfile(store, {
    profileId: 'gateway-test', entryRoleId: TEST_ROLE_ID, sourceKind: ROLE_CATALOG_PROFILE_SOURCE.CUSTOM,
  });
}

function seedGatewayProfile(store: Store, options: GatewayFixtureOptions): void {
  addExecutionProfile(store, {
    id: 'fake-impl', roleId: TEST_ROLE_ID, adapterId: 'fake', agentId: TEST_ROLE_ID, providerId: TEST_PROVIDER_ID,
    modelId: TEST_MODEL_ID, adapterConfig: { endpoint: 'fake' },
    observationIntervalMs: options.observationIntervalMs ?? DEFAULT_OBSERVATION_INTERVAL_MS,
    noProgressTimeoutMs: options.noProgressTimeoutMs ?? DEFAULT_NO_PROGRESS_TIMEOUT_MS,
    cancellationGraceMs: options.cancellationGraceMs ?? DEFAULT_CANCELLATION_GRACE_MS,
    ...(options.maxRunDurationMs === undefined ? {} : { maxRunDurationMs: options.maxRunDurationMs }),
    tools: { read: true }, enabled: true,
  });
  if (options.seedModelEvidence === false) return;
  addModelCapabilityEvidence(store, {
    providerId: TEST_PROVIDER_ID, modelId: TEST_MODEL_ID, capabilityId: IMPLEMENTATION_CAPABILITY_ID,
    evidenceRef: 'evaluation:gateway-fixture', evidenceDigest: TEST_MODEL_EVIDENCE_DIGEST,
    assessedAt: TEST_MODEL_EVIDENCE_ASSESSED_AT, expiresAt: TEST_MODEL_EVIDENCE_EXPIRES_AT,
  });
}

export async function gatewayFixture(options: GatewayFixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'svp-gateway-'));
  const store = openStore(root);
  seedGatewayContext(store, root);
  seedGatewayContracts(store);
  seedGatewayRoles(store);
  seedGatewayProfile(store, options);
  if (options.activateCatalog !== false) activateRoleCatalog(store);
  return { root, store };
}

export function claimedAgentEffect(
  store: ReturnType<typeof openStore>,
  options: {
    input?: unknown;
    inputContractRef?: string;
    outputContractRef?: string;
    requestedCapabilities?: readonly string[];
  } = {},
): WorkflowEffect {
  const inputContractRef = options.inputContractRef ?? 'task-v1';
  const outputContractRef = options.outputContractRef ?? 'report-v1';
  registerWorkflowDefinition(store, {
    id: TEST_WORKFLOW_ID,
    startStepKey: TEST_WORKFLOW_STEP,
    steps: [{
      key: TEST_WORKFLOW_STEP, executor: WORKFLOW_EXECUTOR.AGENT, roleId: TEST_ROLE_ID, phase: 'delivery',
      inputContractRef, outputContractRef, maxAttempts: 2,
      requestedCapabilities: options.requestedCapabilities ?? [ARTIFACT_READ_CAPABILITY],
    }],
    routes: [{ fromStepKey: TEST_WORKFLOW_STEP, priority: 0 }],
  });
  startWorkflow(store, {
    definitionId: TEST_WORKFLOW_ID, subjectRef: 'test:subject', requestedBy: 'runtime:test',
    inputContractRef, input: options.input ?? { task: 'Implement the bounded change' },
  });
  const effect = claimWorkflowEffect(store, 'gateway-test-worker', 60_000);
  if (effect === undefined) throw new Error('test workflow did not yield an effect');
  return effect;
}
