export interface PreflightCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'unknown';
  detail: string;
}

export interface PreflightReport {
  packetId: string;
  pr: string | undefined;
  headSha: string;
  headShaMatch: 'match' | 'mismatch' | 'unknown';
  ciChecks: PreflightCheck[];
  verifyResult: PreflightCheck;
  writeSetViolations: string[];
  redTestFound: boolean;
  stopConditions: PreflightCheck[];
  deviationBullets: string[];
  checks: PreflightCheck[];
  overall: 'pass' | 'fail';
}
