import type { BaselineConfig } from './config.types.js';
import { BASELINE_RESULT } from './baseline.constants.js';

// Distinto de src/check/source-baseline.ts (que compara un INVENTARIO
// completo por count+digest) — este baseline es por FINGERPRINT individual
// ("perdonado" uno por uno, en config.baseline.fingerprints), usado por
// gates más antiguos/puntuales que no agrupan su deuda en un único
// inventario versionado.
export function checkViolation(
  fingerprint: string,
  baseline: BaselineConfig | undefined,
): typeof BASELINE_RESULT[keyof typeof BASELINE_RESULT] {
  if (baseline?.fingerprints?.includes(fingerprint)) {
    return BASELINE_RESULT.GRANDFATHERED;
  }
  return BASELINE_RESULT.FAILING;
}
