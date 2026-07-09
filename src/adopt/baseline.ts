import type { BaselineConfig } from '../config.types.js';

export function checkViolation(
  fingerprint: string,
  baseline: BaselineConfig,
): 'grandfathered' | 'failing' {
  if (baseline.fingerprints?.includes(fingerprint)) {
    return 'grandfathered';
  }
  return 'failing';
}
