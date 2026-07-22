// HUMAN_INTAKE_VALUE.LOCAL_ACTOR fija el "requestedBy" cuando el mensaje
// viene de una interacción local, sin sesión atada — provenance
// PROVENANCE_KIND ('human-stated') es lo que distingue este intake de
// contenido generado por un agente en el context catalog.
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
