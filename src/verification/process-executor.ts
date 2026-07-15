import { spawn } from 'node:child_process';
import { VERIFICATION_STATUS } from './verification.constants.js';
import type {
  VerificationComponent,
  VerificationComponentReceipt,
  VerificationExecutor,
} from './verification.types.js';

export class ProcessVerificationExecutor implements VerificationExecutor {
  async execute(component: VerificationComponent): Promise<VerificationComponentReceipt> {
    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn(component.command, { shell: true, stdio: 'inherit' });
      child.once('error', () => { resolve(1); });
      child.once('exit', (code) => { resolve(code ?? 1); });
    });
    return {
      id: component.id,
      status: exitCode === 0 ? VERIFICATION_STATUS.PASS : VERIFICATION_STATUS.FAIL,
      exitCode,
    };
  }
}
