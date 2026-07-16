import type { BaselineConfig } from './config.types.js';
import { BASELINE_RESULT } from './baseline.constants.js';

export function checkViolation(
  fingerprint: string,
  baseline: BaselineConfig | undefined,
): typeof BASELINE_RESULT[keyof typeof BASELINE_RESULT] {
  if (baseline?.fingerprints?.includes(fingerprint)) {
    return BASELINE_RESULT.GRANDFATHERED;
  }
  return BASELINE_RESULT.FAILING;
}
