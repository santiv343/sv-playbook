// Vocabulario central del motor de workflows (flujo de orquestación aparte
// del ciclo de vida de packets — dos state machines distintas en el mismo
// repo, no confundir). HUMAN es un executor de PRIMERA CLASE acá (no un caso
// especial): un paso HUMAN se resuelve vía resolveHumanWorkflowEffect
// (effect-completion.ts) con su propio lease corto (HUMAN_EFFECT_LEASE_MS).
export const WORKFLOW_EXECUTOR = {
  AGENT: 'agent',
  RUNTIME: 'runtime',
  HUMAN: 'human',
} as const;

export const WORKFLOW_EXECUTORS = [
  WORKFLOW_EXECUTOR.AGENT,
  WORKFLOW_EXECUTOR.RUNTIME,
  WORKFLOW_EXECUTOR.HUMAN,
] as const;

export const WORKFLOW_DEFINITION_STATUS = {
  ACTIVE: 'active',
  RETIRED: 'retired',
} as const;

export const WORKFLOW_DEFINITION_STATUSES = [
  WORKFLOW_DEFINITION_STATUS.ACTIVE,
  WORKFLOW_DEFINITION_STATUS.RETIRED,
] as const;

export const WORKFLOW_STATUS = {
  RUNNING: 'running',
  WAITING: 'waiting',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const WORKFLOW_STATUSES = [
  WORKFLOW_STATUS.RUNNING,
  WORKFLOW_STATUS.WAITING,
  WORKFLOW_STATUS.COMPLETED,
  WORKFLOW_STATUS.FAILED,
  WORKFLOW_STATUS.CANCELLED,
] as const;

export const WORKFLOW_EFFECT_STATUS = {
  PENDING: 'pending',
  CLAIMED: 'claimed',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const WORKFLOW_EFFECT_STATUSES = [
  WORKFLOW_EFFECT_STATUS.PENDING,
  WORKFLOW_EFFECT_STATUS.CLAIMED,
  WORKFLOW_EFFECT_STATUS.COMPLETED,
  WORKFLOW_EFFECT_STATUS.FAILED,
  WORKFLOW_EFFECT_STATUS.CANCELLED,
] as const;

export const WORKFLOW_EVENT = {
  STARTED: 'workflow-started',
  EFFECT_CLAIMED: 'effect-claimed',
  EFFECT_LEASE_RENEWED: 'effect-lease-renewed',
  EFFECT_RETRY_SCHEDULED: 'effect-retry-scheduled',
  STEP_ADVANCED: 'step-advanced',
  COMPLETED: 'workflow-completed',
  FAILED: 'workflow-failed',
  EFFECT_RECOVERED: 'effect-recovered',
} as const;

export const WORKFLOW_ERROR = {
  INVALID_DEFINITION: 'INVALID_WORKFLOW_DEFINITION',
  UNKNOWN_DEFINITION: 'UNKNOWN_WORKFLOW_DEFINITION',
  INPUT_CONTRACT_MISMATCH: 'WORKFLOW_INPUT_CONTRACT_MISMATCH',
  INVALID_EFFECT_LEASE: 'INVALID_EFFECT_LEASE',
  EFFECT_CLAIM_CONFLICT: 'EFFECT_CLAIM_CONFLICT',
  EFFECT_NOT_OWNED: 'EFFECT_NOT_OWNED',
  ROUTE_NOT_FOUND: 'WORKFLOW_ROUTE_NOT_FOUND',
  UNKNOWN_WORKFLOW: 'UNKNOWN_WORKFLOW',
  INVALID_STATE: 'INVALID_WORKFLOW_STATE',
  HUMAN_EFFECT_NOT_PENDING: 'HUMAN_EFFECT_NOT_PENDING',
} as const;

export const WORKFLOW_RUNTIME_ERROR = {
  INVALID_BINDING: 'INVALID_WORKFLOW_RUNTIME_BINDING',
  ADAPTER_UNAVAILABLE: 'WORKFLOW_ADAPTER_UNAVAILABLE',
  OPERATION_UNAVAILABLE: 'WORKFLOW_OPERATION_UNAVAILABLE',
} as const;

export const WORKFLOW_INTAKE_ERROR = {
  UNAVAILABLE: 'HUMAN_INTAKE_UNAVAILABLE',
  AMBIGUOUS: 'HUMAN_INTAKE_AMBIGUOUS',
  PROJECTOR_UNAVAILABLE: 'HUMAN_INTAKE_PROJECTOR_UNAVAILABLE',
  INVALID_MESSAGE: 'HUMAN_INTAKE_INVALID_MESSAGE',
} as const;

export const WORKFLOW_ID_PREFIX = 'WF-';
export const WORKFLOW_DEFINITION_VERSION = { INITIAL: 1, INCREMENT: 1 } as const;
export const WORKFLOW_EFFECT_ID_PREFIX = 'EFF-';
export const WORKFLOW_ARTIFACT_ID_PREFIX = 'ART-';
export const INVALID_LEASE_DURATION_MESSAGE = 'lease duration must be positive';
export const JSON_POINTER_PREFIX = '/';
export const HUMAN_EFFECT_LEASE_MS = 60_000;
export const HUMAN_LEASE_OWNER_PREFIX = 'human:';

export const COORDINATOR_CONFIG_KEY = 'default';
export const COORDINATOR_CONFIG_DEFAULTS = {
  EFFECT_LEASE_MS: 60_000,
  LEASE_RENEWAL_INTERVAL_MS: 20_000,
  IDLE_POLL_INTERVAL_MS: 500,
} as const;

export type WorkflowExecutor = typeof WORKFLOW_EXECUTORS[number];
export type WorkflowStatus = typeof WORKFLOW_STATUSES[number];
export type WorkflowEffectStatus = typeof WORKFLOW_EFFECT_STATUSES[number];
