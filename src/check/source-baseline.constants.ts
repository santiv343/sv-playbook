// Los 5 veredictos posibles de evaluateSourceBaseline (source-baseline.ts):
// MATCH es el único estado verde; MISSING/INCREASED/CHANGED son fail;
// DECREASED no es fail pero exige acción humana (actualizar el baseline) —
// no se auto-corrige para que bajar deuda quede como un cambio deliberado
// y visible en el diff de config, no silencioso.
export const SOURCE_BASELINE_STATUS = {
  CHANGED: 'changed',
  DECREASED: 'decreased',
  INCREASED: 'increased',
  MATCH: 'match',
  MISSING: 'missing',
} as const;
