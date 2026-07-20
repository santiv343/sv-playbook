// Los 2 veredictos de checkViolation (baseline.ts) — GRANDFATHERED significa
// "esta violación puntual ya estaba aceptada en el baseline por fingerprint
// exacto", distinto del mecanismo de SourceBaseline (count+digest) que
// evaluateSourceBaseline usa para inventarios completos.
export const BASELINE_RESULT = { GRANDFATHERED: 'grandfathered', FAILING: 'failing' } as const;
