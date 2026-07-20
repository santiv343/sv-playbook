import { canonicalJson } from '../context/digest.js';
import { ProcessVerificationExecutor } from './process-executor.js';
import { runVerification } from './runner.js';
import { VERIFICATION_STATUS } from './verification.constants.js';

// Entry point real de `npm run verify` — ProcessVerificationExecutor es la
// implementación que de verdad spawnea procesos (typecheck/lint/test/gates);
// runVerification (runner.ts) es agnóstico del executor, testeable con un
// fake que no ejecute nada real.
const receipt = await runVerification(new ProcessVerificationExecutor());
process.stdout.write(`${canonicalJson(receipt)}\n`);
if (receipt.status === VERIFICATION_STATUS.FAIL) process.exitCode = 1;
