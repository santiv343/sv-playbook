export const PROTOCOL_WORK_SCHEMA_VERSION = 1;
export const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
export const PROTOCOL_CONTRACT_ID_PREFIX = 'urn:sv-playbook:artifact-contract:';

export const PROPOSAL_FORBIDDEN_KEYWORDS = new Set(['$id', '$schema']);
export const PROPOSAL_TOP_LEVEL_KEYS = new Set(['properties', 'required']);
export const JSON_SCHEMA_KEY = {
  REF: '$ref',
  TYPE: 'type',
  ADDITIONAL_PROPERTIES: 'additionalProperties',
} as const;
export { JSON_SCHEMA_TYPE } from '../schema/json-schema.constants.js';

export const SHARED_PROTOCOL_DEFINITION = {
  PROVENANCE: 'provenance',
  ESCALATION: 'escalation',
  CORRECTION_RECORD: 'correction-record',
} as const;
