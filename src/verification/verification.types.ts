import type { VERIFICATION_STATUS } from './verification.constants.js';

export interface VerificationComponent {
  id: string;
  command: string;
}

export type VerificationStatus = typeof VERIFICATION_STATUS[keyof typeof VERIFICATION_STATUS];

export interface VerificationComponentReceipt {
  id: string;
  status: VerificationStatus;
  exitCode: number;
}

export interface VerificationReceipt {
  manifestDigest: string;
  status: VerificationStatus;
  components: VerificationComponentReceipt[];
}

export interface VerificationExecutor {
  execute(component: VerificationComponent): Promise<VerificationComponentReceipt>;
}
