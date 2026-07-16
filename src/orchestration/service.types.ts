import type { WorkflowExecutor, WorkflowStatus } from './orchestration.constants.js';

export type WorkflowExecutorKind = WorkflowExecutor;

export interface WorkflowStepDefinitionInput {
  key: string;
  executor: WorkflowExecutorKind;
  roleId?: string;
  operationId?: string;
  phase: string;
  inputContractRef: string;
  outputContractRef: string;
  contextTags?: readonly string[];
  contextReferences?: readonly string[];
  requestedCapabilities?: readonly string[];
  maxAttempts: number;
}

export interface WorkflowRouteDefinitionInput {
  fromStepKey: string;
  targetStepKey?: string;
  outputPointer?: string;
  equals?: unknown;
  priority: number;
}

export interface WorkflowDefinitionInput {
  id: string;
  startStepKey: string;
  steps: readonly WorkflowStepDefinitionInput[];
  routes: readonly WorkflowRouteDefinitionInput[];
}

export interface VersionedWorkflowDefinitionInput extends WorkflowDefinitionInput {
  version: number;
}

export interface WorkflowDefinitionRegistration {
  id: string;
  version: number;
  definitionDigest: string;
}

export interface StartWorkflowInput {
  definitionId: string;
  definitionVersion?: number;
  subjectRef: string;
  requestedBy: string;
  inputContractRef: string;
  input: unknown;
}

export interface WorkflowEffect {
  id: string;
  workflowId: string;
  stepKey: string;
  executor: WorkflowExecutorKind;
  roleId: string | null;
  operationId: string | null;
  phase: string;
  inputArtifactId: string;
  inputContractRef: string;
  input: unknown;
  outputContractRef: string;
  requestedCapabilities: readonly string[];
  contextTags: readonly string[];
  contextReferences: readonly string[];
  attempt: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: string;
}

export interface CompleteWorkflowEffectInput {
  effectId: string;
  leaseOwner: string;
  output: unknown;
}

export interface FailWorkflowEffectInput {
  effectId: string;
  leaseOwner: string;
  failureCode: string;
  failureDetail: string;
  retryable: boolean;
}

export interface RenewWorkflowEffectLeaseInput {
  effectId: string;
  leaseOwner: string;
  leaseMs: number;
}

export interface ResolveHumanWorkflowEffectInput {
  effectId: string;
  resolvedBy: string;
  output: unknown;
}

export interface WorkflowSnapshot {
  id: string;
  definitionId: string;
  definitionVersion: number;
  subjectRef: string;
  status: WorkflowStatus;
  currentStepKey: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
