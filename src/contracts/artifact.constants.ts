// ACTIVE/RETIRED es el mismo vocabulario que managed-contracts.ts usa —
// un contrato nunca se borra, sólo se retira cuando ya tiene artefactos
// inmutables que lo referencian y necesita evolucionar.
export const ARTIFACT_CONTRACT_STATUS = {
  ACTIVE: 'active',
  RETIRED: 'retired',
} as const;

export const ARTIFACT_CONTRACT_ERROR = {
  UNKNOWN_CONTRACT: 'UNKNOWN_ARTIFACT_CONTRACT',
  INVALID_CONTRACT: 'INVALID_ARTIFACT_CONTRACT',
  CONTRACT_VIOLATION: 'ARTIFACT_CONTRACT_VIOLATION',
} as const;

export const JSON_SCHEMA_TOKEN = {
  REFERENCE_KEY: '$ref',
  FRAGMENT: '#',
  DEFINITIONS_FRAGMENT: '/$defs/',
} as const;
