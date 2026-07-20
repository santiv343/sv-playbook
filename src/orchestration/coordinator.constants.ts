// COORDINATOR_OUTCOME es lo que WorkflowCoordinator decide hacer tras
// ejecutar un efecto: COMPLETED/FAILED son terminales, RENEW significa "el
// efecto sigue en curso, extender el lease y seguir esperando" — no es un
// resultado del EFECTO en sí (eso es WORKFLOW_EFFECT_STATUS), es la
// decisión del coordinator sobre qué hacer con la CLAIM que tiene sobre él.
export const COORDINATOR_OUTCOME = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  RENEW: 'renew',
} as const;

export const COORDINATOR_ERROR = {
  EXECUTOR_UNAVAILABLE: 'WORKFLOW_EXECUTOR_UNAVAILABLE',
  INVALID_AGENT_EFFECT: 'INVALID_AGENT_WORKFLOW_EFFECT',
  INVALID_RUNTIME_EFFECT: 'INVALID_RUNTIME_WORKFLOW_EFFECT',
  RUNTIME_OPERATION_UNAVAILABLE: 'RUNTIME_OPERATION_UNAVAILABLE',
  UNCLASSIFIED: 'UNCLASSIFIED_EFFECT_FAILURE',
} as const;
