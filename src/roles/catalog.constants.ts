// SELF_HANDOFF es un error real que catalog.ts previene: un rol no puede
// declarar un handoff hacia sí mismo (source === target), eso rompería la
// cadena de autoridad de HJ-004 (siempre hay un handoff a alguien
// distinto). ACTIVE_CATALOG_DRIFT es lo que activateRoleCatalog detecta si
// el catálogo persistido cambió sin pasar por una activación explícita.
export const ROLE_CATALOG_SQL = {
  BEGIN: 'BEGIN IMMEDIATE',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  INSERT_ESCALATION_CLASS: 'INSERT INTO role_escalation_classes (role_id, class_id) VALUES (?, ?)',
} as const;

export const ROLE_CATALOG_ERROR = {
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  UNKNOWN_RESPONSIBILITY: 'UNKNOWN_RESPONSIBILITY',
  DETERMINISTIC_RESPONSIBILITY: 'DETERMINISTIC_ROLE_RESPONSIBILITY',
  SELF_HANDOFF: 'SELF_HANDOFF',
  INVALID_CATALOG: 'INVALID_ROLE_CATALOG',
  ACTIVE_CATALOG_MISSING: 'ACTIVE_ROLE_CATALOG_MISSING',
  ACTIVE_CATALOG_DRIFT: 'ACTIVE_ROLE_CATALOG_DRIFT',
  INVALID_MODEL_EVIDENCE: 'INVALID_MODEL_CAPABILITY_EVIDENCE',
  MODEL_EVIDENCE_MISSING: 'MODEL_CAPABILITY_EVIDENCE_MISSING',
  MODEL_EVIDENCE_NOT_CURRENT: 'MODEL_CAPABILITY_EVIDENCE_NOT_CURRENT',
  UNKNOWN_ROLE: 'UNKNOWN_ROLE',
} as const;

export const ROLE_CONTEXT_SELECTOR_DIMENSION = 'role';

export const ROLE_CATALOG_PROFILE_KEY = 'active';
export const ROLE_CATALOG_ACTIVE_PROFILE_COUNT = 1;
export const ROLE_CATALOG_PROFILE_SOURCE = {
  BUNDLED: 'bundled',
  CUSTOM: 'custom',
} as const;
