import { canonicalJson } from '../context/digest.js';
import { ProcessVerificationExecutor } from './process-executor.js';
import { runVerification } from './runner.js';
import { VERIFICATION_STATUS } from './verification.constants.js';

const receipt = await runVerification(new ProcessVerificationExecutor());
process.stdout.write(`${canonicalJson(receipt)}\n`);
if (receipt.status === VERIFICATION_STATUS.FAIL) process.exitCode = 1;
