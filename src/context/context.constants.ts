// 4 estados del ciclo de vida de un context item: ACTIVE es lo único que
// compileContext() considera; SUPERSEDED es lo que produce
// validateSupersessions (context/repository.ts) al reemplazar un ítem;
// DEFERRED/RETIRED existen para gradúa la retirada de un ítem sin borrar su
// historia (item inmutable, sólo cambia status). STRENGTH es ortogonal —
// MANDATORY vs ADVISORY vs REFERENCE decide cómo el compilador prioriza
// contenido cuando hay conflicto de precedencia, no si el ítem está vivo.
export const CONTEXT_ITEM_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUPERSEDED: 'superseded',
  DEFERRED: 'deferred',
  RETIRED: 'retired',
} as const);

export const CONTEXT_ITEM_STRENGTH = Object.freeze({
  MANDATORY: 'mandatory',
  ADVISORY: 'advisory',
  REFERENCE: 'reference',
} as const);

export const CAPABILITY_EFFECT = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
} as const);

export const CONTEXT_PACK_SCHEMA_VERSION = 1 as const;
export const SELECTOR_WILDCARD = '*';

export const CONTEXT_ERROR = {
  DUPLICATE_ITEM: 'DUPLICATE_ITEM',
  DUPLICATE_ACTIVE_VERSION: 'DUPLICATE_ACTIVE_VERSION',
  MISSING_REFERENCE: 'MISSING_REFERENCE',
  INACTIVE_REFERENCE: 'INACTIVE_REFERENCE',
  DEPENDENCY_CYCLE: 'DEPENDENCY_CYCLE',
  DEPENDENCY_NOT_APPLICABLE: 'DEPENDENCY_NOT_APPLICABLE',
  REFERENCE_NOT_APPLICABLE: 'REFERENCE_NOT_APPLICABLE',
  MISSING_PRECEDENCE: 'MISSING_PRECEDENCE',
  CONTEXT_CONFLICT: 'CONTEXT_CONFLICT',
  CAPABILITY_CONFLICT: 'CAPABILITY_CONFLICT',
  INVALID_SUPERSESSION: 'INVALID_SUPERSESSION',
  UNKNOWN_ROLE_SELECTOR: 'UNKNOWN_ROLE_SELECTOR',
} as const;
