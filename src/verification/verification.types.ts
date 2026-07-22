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

// manifestDigest en VerificationReceipt es el digest de VERIFICATION_MANIFEST
// mismo — ata el receipt a QUÉ conjunto de componentes se corrió, así un
// cambio futuro al manifest no se confunde con una corrida vieja.
// VerificationExecutor es el puerto que separa "correr un componente" de
// "orquestar todos" (runner.ts) — ProcessVerificationExecutor es la única
// implementación real (verification/cli.ts).
export interface VerificationExecutor {
  execute(component: VerificationComponent): Promise<VerificationComponentReceipt>;
}
