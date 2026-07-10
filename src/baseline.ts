import type { BaselineConfig } from './config.types.js';

export function checkViolation(
  fingerprint: string,
  baseline: BaselineConfig | undefined,
): 'grandfathered' | 'failing' {
  if (baseline?.fingerprints?.includes(fingerprint)) {
    return 'grandfathered';
  }
  return 'failing';
}
