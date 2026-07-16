import type { ResolvedWorkDefinitionReference, WorkDefinitionReference } from '../tasks/work-definition.types.js';
import type { REFERENCE_KIND } from '../platform.constants.js';

export interface ExecutionProfileInput {
  id: string;
  roleId: string;
  adapterId: string;
  agentId: string;
  providerId: string;
  modelId: string;
  variant?: string;
  adapterConfig: Readonly<Record<string, unknown>>;
  observationIntervalMs: number;
  noProgressTimeoutMs: number;
  cancellationGraceMs: number;
  maxRunDurationMs?: number;
  tools: Readonly<Record<string, boolean>>;
  enabled: boolean;
}

export type ExecutionProfile = ExecutionProfileInput;

export interface ExecutionProfileCloneInput {
  sourceProfileId: string;
  id: string;
  roleId: string;
  agentId: string;
  providerId?: string;
  modelId?: string;
  variant?: string;
  tools?: Readonly<Record<string, boolean>>;
}

export interface WorkRunSpecRequest {
  roleId: string;
  phase: string;
  workDefinitionRef: WorkDefinitionReference;
  executionProfileId?: string;
}

export interface WorkflowEffectReference {
  kind: typeof REFERENCE_KIND.WORKFLOW_EFFECT;
  id: string;
  workflowId: string;
  stepKey: string;
  attempt: number;
}

export interface ContextItemReference {
  kind: typeof REFERENCE_KIND.CONTEXT_ITEM;
  id: string;
  version: number;
}

export interface RunSpec {
  id: string;
  roleId: string;
  phase: string;
  workDefinitionRef: ResolvedWorkDefinitionReference | null;
  workflowEffectRef: WorkflowEffectReference | null;
  inputArtifactId: string | null;
  contextPackId: string;
  executionProfile: ExecutionProfile;
  contextTags: readonly string[];
  contextReferences: readonly ContextItemReference[];
  requestedCapabilities: readonly string[];
  outputContractRef: string;
  noProgressTimeoutMs: number;
  cancellationGraceMs: number;
  maxRunDurationMs?: number;
  retryOfRunSpecId: string | null;
  specDigest: string;
}

export interface RunSpecContractSnapshot {
  contextItemRef: string;
  inputContractRef: string;
  outputContractRef: string;
}

export interface ResolvedRunSpecRequest {
  roleId: string;
  phase: string;
  storageSubjectRef: string;
  storageDispatchRef: string;
  workDefinitionRef: ResolvedWorkDefinitionReference | null;
  workflowEffectRef: WorkflowEffectReference | null;
  inputArtifactId: string | null;
  contextTags: readonly string[];
  contextReferenceStrings: readonly string[];
  requestedCapabilities: readonly string[];
  retryOfRunSpecId: string | null;
  executionProfileId?: string;
}

export interface AdapterOperationRequest {
  runSpec: RunSpec;
  intentId: string;
  operationKey: string;
  directory: string;
}

export interface AdapterProfileReceipt {
  adapterId: string;
  profileDigest: string;
  evidence: Readonly<Record<string, unknown>>;
}

export interface AdapterSessionReceipt {
  adapterId: string;
  sessionId: string;
  profileDigest: string;
  sessionReceipt: Readonly<Record<string, unknown>>;
}

export interface AdapterTurnRequest extends AdapterOperationRequest {
  sessionId: string;
  prompt: string;
  outputSchema: Readonly<Record<string, unknown>>;
}

export interface AdapterTurnReceipt {
  adapterId: string;
  sessionId: string;
  messageId: string;
  submissionReceipt: Readonly<Record<string, unknown>>;
}

export const ADAPTER_RUN_STATE = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type AdapterRunState = typeof ADAPTER_RUN_STATE[keyof typeof ADAPTER_RUN_STATE];

export interface AdapterObservationRequest extends AdapterOperationRequest {
  sessionId: string;
  messageId: string;
}

export interface AdapterRunFailure {
  code: string;
  message: string;
  evidence: Readonly<Record<string, unknown>>;
}

export interface AdapterRunObservation {
  adapterId: string;
  sessionId: string;
  messageId: string;
  state: AdapterRunState;
  progressToken: string;
  observedToolIds: readonly string[];
  output?: string;
  // First completed in-flight response, surfaced while the provider session is
  // still busy; the gateway completes from it only if it passes the output contract.
  candidateOutput?: string;
  failure?: AdapterRunFailure;
  evidence: Readonly<Record<string, unknown>>;
}

export interface AdapterCancellationReceipt {
  adapterId: string;
  sessionId: string;
  messageId: string;
  acknowledged: boolean;
  evidence: Readonly<Record<string, unknown>>;
}

export interface GatewayRuntime {
  now(): number;
  sleep(delayMs: number): Promise<void>;
}

export interface GatewayCompletionReceipt {
  output: unknown;
  outputDigest: string;
  observation: AdapterRunObservation;
}

export interface GatewayDispatchReceipt {
  session: AdapterSessionReceipt;
  turn: AdapterTurnReceipt;
  completion: GatewayCompletionReceipt;
}

export interface AgentAdapter {
  readonly id: string;
  verifyProfile(runSpec: RunSpec, directory: string): Promise<AdapterProfileReceipt>;
  createSession(request: AdapterOperationRequest, profile: AdapterProfileReceipt): Promise<AdapterSessionReceipt>;
  submitTurn(request: AdapterTurnRequest): Promise<AdapterTurnReceipt>;
  observeRun(request: AdapterObservationRequest): Promise<AdapterRunObservation>;
  cancelRun(request: AdapterObservationRequest): Promise<AdapterCancellationReceipt>;
}
