import { SOURCE_BASELINE_STATUS } from './source-baseline.constants.js';
import type { SourceBaseline, SourceBaselineEvaluation } from './source-baseline.types.js';

// Gate anti-regresión compartido por todos los inventarios de deuda
// (duplicados de string, comparaciones literales, etc. — ver
// check/duplicate-string.ts): compara el conteo actual contra un baseline
// congelado. Subir el conteo es FAIL (`INCREASED`); bajarlo pide
// actualizar el baseline a mano (`DECREASED`, no se auto-actualiza —
// bajar deuda es una mejora que hay que reconocer explícitamente, no
// blanquear); mismo conteo pero distinto contenido (`digest`) es
// `CHANGED` — señal de que la deuda se movió de lugar sin reducirse.
export function evaluateSourceBaseline(
  label: string,
  inventory: SourceBaseline,
  baseline: SourceBaseline | undefined,
): SourceBaselineEvaluation {
  if (baseline === undefined) {
    return { status: SOURCE_BASELINE_STATUS.MISSING, message: `missing ${label} baseline for ${inventory.count} violations` };
  }
  if (inventory.count > baseline.count) {
    return { status: SOURCE_BASELINE_STATUS.INCREASED, message: `${label} debt increased: ${baseline.count} -> ${inventory.count}` };
  }
  if (inventory.count < baseline.count) {
    return { status: SOURCE_BASELINE_STATUS.DECREASED, message: `${label} debt decreased: update baseline ${baseline.count} -> ${inventory.count}` };
  }
  if (inventory.digest !== baseline.digest) {
    return { status: SOURCE_BASELINE_STATUS.CHANGED, message: `${label} debt changed without decreasing its count` };
  }
  return { status: SOURCE_BASELINE_STATUS.MATCH, message: `${label} baseline matches ${inventory.count} violations` };
}
