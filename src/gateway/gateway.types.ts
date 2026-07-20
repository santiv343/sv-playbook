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

// RunSpec es la unidad de trabajo que el gateway le manda a un agente
// externo (flujo 08): agrupa el contexto (contextPackId/contextTags/
// contextReferences), a qué está atado (workDefinitionRef XOR
// workflowEffectRef — un RunSpec sirve tanto al mundo de packets como al de
// workflows orquestados), y bajo qué perfil de ejecución corre
// (executionProfile: qué adapter/modelo/tools). specDigest es el ancla de
// integridad — todo lo que se le manda al agente debe reconstruirse
// exactamente igual a partir de esta estructura.
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
  UNKNOWN: 'unknown',
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

// El contrato que TODO adapter de agente externo debe implementar
// (OpenCodeAdapter es hoy la única implementación real, ver
// adapters/opencode-adapter.ts). Los 5 métodos son las 5 fases de un
// diálogo con el agente: verificar el perfil sirve, crear sesión, mandar el
// turno, observar progreso (polling), cancelar. Cualquier adapter nuevo
// (otro CLI de agente) sólo necesita implementar esta interfaz — el resto
// del gateway (coordinator, recovery) es agnóstico de CUÁL adapter es.
export interface AgentAdapter {
  readonly id: string;
  verifyProfile(runSpec: RunSpec, directory: string): Promise<AdapterProfileReceipt>;
  createSession(request: AdapterOperationRequest, profile: AdapterProfileReceipt): Promise<AdapterSessionReceipt>;
  submitTurn(request: AdapterTurnRequest): Promise<AdapterTurnReceipt>;
  observeRun(request: AdapterObservationRequest): Promise<AdapterRunObservation>;
  cancelRun(request: AdapterObservationRequest): Promise<AdapterCancellationReceipt>;
}
