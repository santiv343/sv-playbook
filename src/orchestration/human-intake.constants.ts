export const HUMAN_INTAKE_CONTRACT = {
  MESSAGE_RUN_STATUS_V1: 'human-message-run-status-v1',
} as const;

export const HUMAN_INTAKE_VALUE = {
  SUBJECT_PREFIX: 'human-request:',
  LOCAL_ACTOR: 'human:local',
  PROVENANCE_KIND: 'human-stated',
} as const;

export const HUMAN_INTAKE_CLASSIFICATION = {
  UNCLASSIFIED: null,
} as const;

export const HUMAN_INTAKE_DETAIL = {
  UNAVAILABLE: 'no active human intake workflow',
} as const;
