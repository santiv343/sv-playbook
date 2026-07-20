// PROPOSAL_FORBIDDEN_KEYWORDS/PROPOSAL_TOP_LEVEL_KEYS son las reglas duras
// de proposalRules (protocol-work.types.ts): un agente NO puede declarar
// `$id`/`$schema` en su propuesta (eso es runtime-owned, ver
// injectRuntimeIdentity en protocol-proposal-batch.ts) ni tocar top-level
// keys fuera de properties/required — la mecanización de "el agente
// propone contenido semántico, el runtime controla la identidad/estructura".
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
