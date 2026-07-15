import { SOURCE_BASELINE_STATUS } from './source-baseline.constants.js';
import type { SourceBaseline, SourceBaselineEvaluation } from './source-baseline.types.js';

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
