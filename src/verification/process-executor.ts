import { spawn } from 'node:child_process';
import { PROCESS_EVENT } from '../platform.constants.js';
import { VERIFICATION_STATUS } from './verification.constants.js';
import type {
  VerificationComponent,
  VerificationComponentReceipt,
  VerificationExecutor,
} from './verification.types.js';

// Implementación real (no-fake) de VerificationExecutor: corre cada
// componente del manifiesto como un subproceso de shell real, con
// stdio heredado (el output se ve en vivo en la terminal, no se
// captura ni se filtra) — el objetivo es que `verify` se sienta y se
// comporte exactamente como correr esos comandos a mano.
export class ProcessVerificationExecutor implements VerificationExecutor {
  async execute(component: VerificationComponent): Promise<VerificationComponentReceipt> {
    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn(component.command, { shell: true, stdio: 'inherit' });
      child.once(PROCESS_EVENT.ERROR, () => { resolve(1); });
      child.once(PROCESS_EVENT.EXIT, (code) => { resolve(code ?? 1); });
    });
    return {
      id: component.id,
      status: exitCode === 0 ? VERIFICATION_STATUS.PASS : VERIFICATION_STATUS.FAIL,
      exitCode,
    };
  }
}
