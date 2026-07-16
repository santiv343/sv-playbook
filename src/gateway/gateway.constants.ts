export const GATEWAY_SQL = {
  BEGIN: 'BEGIN IMMEDIATE',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  CONSUME_INTENT: "UPDATE dispatch_intents SET status = 'consumed', updated_at = ? WHERE id = ? AND status = 'committed'",
} as const;

export const DISPATCH_INTENT_STATUS = {
  COMMITTED: 'committed',
  CONSUMED: 'consumed',
  BLOCKED: 'blocked',
} as const;

export const GATEWAY_OPERATION = {
  CREATE_SESSION: 'create-session',
  SUBMIT_TURN: 'submit-turn',
  OBSERVE_TURN: 'observe-turn',
  CANCEL_ORPHAN: 'cancel-orphan',
} as const;

export const GATEWAY_RECOVERY_DETAIL = {
  ORPHANED: 'observing agent run no longer belongs to an active workflow effect',
  CANCELLATION_FAILED: 'orphaned agent run cancellation failed',
} as const;

export const EXECUTION_PROFILE_ERROR = {
  INVALID: 'INVALID_EXECUTION_PROFILE',
  UNKNOWN: 'UNKNOWN_EXECUTION_PROFILE',
  UNAVAILABLE_FOR_ROLE: 'EXECUTION_PROFILE_UNAVAILABLE_FOR_ROLE',
  AMBIGUOUS_FOR_ROLE: 'EXECUTION_PROFILE_AMBIGUOUS_FOR_ROLE',
} as const;

export const RUN_SPEC_ERROR = {
  UNKNOWN_ROLE: 'UNKNOWN_ROLE',
  UNRESOLVED_OUTPUT_CONTRACT: 'UNRESOLVED_ROLE_OUTPUT_CONTRACT',
  UNKNOWN_INPUT_ARTIFACT: 'UNKNOWN_INPUT_ARTIFACT',
  INPUT_ARTIFACT_CONTRACT_MISMATCH: 'INPUT_ARTIFACT_CONTRACT_MISMATCH',
  EXECUTION_PROFILE_DISABLED: 'EXECUTION_PROFILE_DISABLED',
  EXECUTION_PROFILE_ROLE_MISMATCH: 'EXECUTION_PROFILE_ROLE_MISMATCH',
  CAPABILITY_DENIED: 'RUNTIME_CAPABILITY_DENIED',
  INVALID: 'INVALID_RUN_SPEC',
  UNKNOWN: 'UNKNOWN_RUN_SPEC',
  MISSING_INPUT_ARTIFACT: 'MISSING_INPUT_ARTIFACT',
  INVALID_CONTEXT_REFERENCE: 'INVALID_CONTEXT_ITEM_REFERENCE',
  RETRY_NOT_TERMINAL: 'RUN_RETRY_NOT_TERMINAL',
  RETRY_COMPLETED: 'RUN_RETRY_COMPLETED',
  WORKFLOW_RETRY: 'WORKFLOW_RUN_RETRY_IS_ENGINE_OWNED',
} as const;

export const RUN_PROMPT_PROTOCOL = 'sv-playbook-run-prompt-v5';
export const RUN_PROMPT_INSTRUCTION = 'Use only this resolved context. Return exactly one value conforming to the JSON Schema in outputContract.schema, with no Markdown or surrounding prose. Encode contradictions or missing authority through contract fields; never replace the contract with a narrative.';
export const RUN_SPEC_ID_PREFIX = 'RUN-';
export const MANUAL_DISPATCH_PREFIX = 'manual:';
export const RUN_PROMPT_FIELD = {
  INPUT_ARTIFACT: 'inputArtifact',
  WORK_DEFINITION: 'workDefinition',
  OUTPUT_CONTRACT: 'outputContract',
} as const;

export const GATEWAY_LIFECYCLE_ERROR = {
  AGENT_RUN_FAILED: 'AGENT_RUN_FAILED',
  PROHIBITED_TOOL_USE: 'PROHIBITED_TOOL_USE',
  NO_PROGRESS_TIMEOUT: 'NO_PROGRESS_TIMEOUT',
  RUN_DURATION_EXCEEDED: 'RUN_DURATION_EXCEEDED',
  CANCELLATION_UNCONFIRMED: 'CANCELLATION_UNCONFIRMED',
  TERMINAL_RUN: 'GATEWAY_RUN_ALREADY_TERMINAL',
} as const;

export const DEFAULT_MAX_RUN_DURATION_MS = 1_800_000;

export const GATEWAY_STATE_ERROR = {
  INVALID: 'INVALID_GATEWAY_STATE',
  ADAPTER_UNAVAILABLE: 'ADAPTER_UNAVAILABLE',
} as const;

export const GATEWAY_RUN_STATUS = {
  OBSERVING: 'observing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed-out',
  POLICY_BLOCKED: 'policy-blocked',
  OUTPUT_INVALID: 'output-invalid',
} as const;

export type GatewayRunStatus = typeof GATEWAY_RUN_STATUS[keyof typeof GATEWAY_RUN_STATUS];
