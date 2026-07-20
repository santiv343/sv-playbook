// DETERMINISTIC vs SEMANTIC es la mecanización de HJ-002/HJ-003: una
// responsabilidad DETERMINISTIC no puede asignarse como juicio de un rol
// (ver runtimeResponsibilities en schema.constants.ts — esas van al motor,
// no a un agente). SELF_CORRECTION_MODE.BOUNDED es el default de todos los
// roles bundled (ver COMMON_POLICY en bundled-profile.constants.ts).
export const RESPONSIBILITY_CLASSIFICATION = {
  SEMANTIC: 'semantic',
  DETERMINISTIC: 'deterministic',
} as const;

export const SELF_CORRECTION_MODE = {
  NONE: 'none',
  BOUNDED: 'bounded',
} as const;

export const ROLE_DEFINITION_INITIAL_VERSION = 1;
export const ROLE_DEFINITION_VERSION_INCREMENT = 1;
