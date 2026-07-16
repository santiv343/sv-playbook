import type { WorkflowEffectStatus, WorkflowExecutor, WorkflowStatus } from './orchestration.constants.js';
import type { GatewayRunStatus } from '../gateway/gateway.constants.js';
import type { AgentRunActivity } from './observability.constants.js';

export interface AgentRunView {
  runSpecId: string;
  workflowId: string | null;
  roleId: string;
  phase: string;
  adapterSessionId: string;
  status: GatewayRunStatus;
  activity: AgentRunActivity;
  observedToolIds: readonly string[];
  lastObservedAt: string;
  lastProgressAt: string;
  terminalAt: string | null;
  detail: string | null;
}

export interface WorkflowRunView {
  id: string;
  definitionId: string;
  definitionVersion: number;
  subjectRef: string;
  requestedBy: string;
  status: WorkflowStatus;
  currentStepKey: string | null;
  revision: number;
  failureCode: string | null;
  failureDetail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowEffectView {
  id: string;
  workflowId: string;
  stepKey: string;
  executor: WorkflowExecutor;
  roleId: string | null;
  operationId: string | null;
  phase: string;
  status: WorkflowEffectStatus;
  attempt: number;
  maxAttempts: number;
  inputArtifactId: string;
  outputArtifactId: string | null;
  outputContractRef: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  detail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HumanActionView {
  effectId: string;
  workflowId: string;
  subjectRef: string;
  stepKey: string;
  phase: string;
  inputContractRef: string;
  input: unknown;
  outputContractRef: string;
  createdAt: string;
}

export interface WorkflowEventView {
  seq: number;
  workflowId: string;
  revision: number;
  eventType: string;
  stepKey: string | null;
  payload: unknown;
  createdAt: string;
}

export interface WorkflowDashboard {
  workflows: readonly WorkflowRunView[];
  effects: readonly WorkflowEffectView[];
  humanActions: readonly HumanActionView[];
  events: readonly WorkflowEventView[];
  agentRuns: readonly AgentRunView[];
  lastEventSeq: number;
}
