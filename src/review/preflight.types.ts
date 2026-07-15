import {
  PREFLIGHT_CLEAN_WORKTREE_KIND,
  PREFLIGHT_FAILURE_CODE,
  PREFLIGHT_PHASE,
} from './preflight.constants.js';

export const PREFLIGHT_STATUS = { PASS: 'pass', FAIL: 'fail', SKIP: 'skip', UNKNOWN: 'unknown' } as const;
export const HEAD_SHA_STATUS = { MATCH: 'match', MISMATCH: 'mismatch', UNKNOWN: 'unknown' } as const;
export const PREFLIGHT_CHECK_NAME = { RED_TEST: 'red-test', VERIFY: 'verify' } as const;
export const PREFLIGHT_EVENT_PREFIX = 'preflight:';

export interface PreflightCheck {
  name: string;
  status: typeof PREFLIGHT_STATUS[keyof typeof PREFLIGHT_STATUS];
  detail: string;
}

export interface VerifyProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly outputTail: string;
  readonly spawnFailed: boolean;
  readonly timedOut: boolean;
  readonly durationMs: number;
}

export interface PreflightPhaseReceipt {
  readonly phase: typeof PREFLIGHT_PHASE[keyof typeof PREFLIGHT_PHASE];
  readonly command: string | null;
  readonly status: typeof PREFLIGHT_STATUS[keyof typeof PREFLIGHT_STATUS];
  readonly failureCode: typeof PREFLIGHT_FAILURE_CODE[keyof typeof PREFLIGHT_FAILURE_CODE] | null;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly outputTail: string;
}

export interface CleanVerificationReceipt {
  readonly boundaryKind: typeof PREFLIGHT_CLEAN_WORKTREE_KIND;
  readonly candidateSha: string | null;
  readonly status: typeof PREFLIGHT_STATUS.PASS | typeof PREFLIGHT_STATUS.FAIL;
  readonly phases: readonly PreflightPhaseReceipt[];
}

export interface PreflightReport {
  packetId: string;
  pr: string | undefined;
  headSha: string;
  headShaMatch: typeof HEAD_SHA_STATUS[keyof typeof HEAD_SHA_STATUS];
  ciChecks: PreflightCheck[];
  verifyResult: PreflightCheck;
  cleanVerification: CleanVerificationReceipt;
  writeSetViolations: string[];
  redTestFound: boolean;
  stopConditions: PreflightCheck[];
  deviationBullets: string[];
  checks: PreflightCheck[];
  overall: typeof PREFLIGHT_STATUS.PASS | typeof PREFLIGHT_STATUS.FAIL;
}
