import type { WorkflowExecutorKind, WorkflowSnapshot } from './service.types.js';

export interface StoredWorkflowDefinition {
  id: string;
  version: number;
  startStepKey: string;
}

export interface StoredWorkflowStep {
  key: string;
  executor: WorkflowExecutorKind;
  roleId: string | null;
  operationId: string | null;
  phase: string;
  inputContractRef: string;
  outputContractRef: string;
  contextTagsJson: string;
  contextReferencesJson: string;
  requestedCapabilitiesJson: string;
  maxAttempts: number;
}

export interface ClaimedWorkflowEffect {
  id: string;
  workflowId: string;
  stepKey: string;
  attempt: number;
  maxAttempts: number;
  executor: WorkflowExecutorKind;
  roleId: string | null;
  operationId: string | null;
  phase: string;
  inputArtifactId: string;
  inputContractRef: string;
  inputJson: string;
  outputContractRef: string;
  requestedCapabilitiesJson: string;
  contextTagsJson: string;
  contextReferencesJson: string;
  definitionId: string;
  definitionVersion: number;
}

export interface FailEffectRecord {
  effect: ClaimedWorkflowEffect;
  leaseOwner: string;
  failureCode: string;
  failureDetail: string;
  retryable: boolean;
  nextEffectId: string;
  at: string;
}

export interface StoredWorkflowRoute {
  targetStepKey: string | null;
  outputPointer: string | null;
  equalsJson: string | null;
}

export interface StartWorkflowRecord {
  id: string;
  definition: StoredWorkflowDefinition;
  subjectRef: string;
  requestedBy: string;
  status: WorkflowSnapshot['status'];
  inputArtifactId: string;
  inputContractRef: string;
  inputJson: string;
  inputDigest: string;
  at: string;
}

export interface CompleteEffectRecord {
  effect: ClaimedWorkflowEffect;
  leaseOwner: string;
  outputArtifactId: string;
  outputJson: string;
  outputDigest: string;
  targetStepKey: string | null;
  targetExecutor: WorkflowExecutorKind | null;
  at: string;
}

// Puerto (en el sentido de arquitectura hexagonal) entre la lógica de
// orquestación (runtime.ts, effect-completion.ts) y la persistencia real
// (DrizzleWorkflowRepository en repository.ts). Todo método que muta estado
// compartido bajo concurrencia (claim, claimHuman, complete, fail, renew)
// hace un UPDATE condicional y devuelve undefined/lanza si el WHERE no
// matcheó — el mismo patrón compare-and-swap documentado en architecture.md.
export interface WorkflowRepositoryPort {
  activeContractExists(ref: string): boolean;
  roleContract(roleId: string): { inputContractRef: string; outputContractRef: string } | undefined;
  nextDefinitionVersion(id: string): number;
  saveDefinition(input: import('./service.types.js').VersionedWorkflowDefinitionInput, definitionDigest: string, at: string): void;
  definition(id: string, version?: number): StoredWorkflowDefinition | undefined;
  step(definition: StoredWorkflowDefinition, stepKey: string): StoredWorkflowStep | undefined;
  start(record: StartWorkflowRecord): void;
  claim(leaseOwner: string, leaseExpiresAt: string, at: string): ClaimedWorkflowEffect | undefined;
  pendingHumanEffect(effectId: string): ClaimedWorkflowEffect | undefined;
  claimHuman(effectId: string, leaseOwner: string, leaseExpiresAt: string, at: string): ClaimedWorkflowEffect | undefined;
  claimedEffect(effectId: string, leaseOwner: string): ClaimedWorkflowEffect | undefined;
  routes(effect: ClaimedWorkflowEffect): readonly StoredWorkflowRoute[];
  complete(record: CompleteEffectRecord): void;
  fail(record: FailEffectRecord): void;
  renew(effectId: string, leaseOwner: string, leaseExpiresAt: string, at: string): void;
  recoverExpired(at: string): number;
  snapshot(workflowId: string): WorkflowSnapshot | undefined;
}
