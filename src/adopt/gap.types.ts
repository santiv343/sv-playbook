export type GapStatus = 'present' | 'missing' | 'violating' | 'unknown';

export interface GapCheckResult {
  requirement: string;
  status: GapStatus;
  reason: string;
}

export interface GapReport {
  checks: GapCheckResult[];
}
