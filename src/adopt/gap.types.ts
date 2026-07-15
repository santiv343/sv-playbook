export const GAP_STATUS = {
  PRESENT: 'present',
  MISSING: 'missing',
  VIOLATING: 'violating',
  UNKNOWN: 'unknown',
} as const;

export type GapStatus = typeof GAP_STATUS[keyof typeof GAP_STATUS];
export const GAP_REQUIREMENT = {
  AGENTS_FILE: 'AGENTS.md',
  CONFIG_FILE: 'playbook.config.json',
  VERIFY_COMMAND: 'verify command',
  PACKETS_DIRECTORY: 'docs/packets/',
  CI_WORKFLOW: 'CI workflow',
  BRANCH_PROTECTION: 'branch protection',
} as const;

export interface GapCheckResult {
  requirement: string;
  status: GapStatus;
  reason: string;
}

export interface GapReport {
  checks: GapCheckResult[];
}
