import { digest } from '../context/digest.js';
import { VERIFICATION_MANIFEST, VERIFICATION_STATUS } from './verification.constants.js';
import type {
  VerificationComponent,
  VerificationExecutor,
  VerificationReceipt,
} from './verification.types.js';

export async function runVerification(
  executor: VerificationExecutor,
  manifest: readonly VerificationComponent[] = VERIFICATION_MANIFEST,
): Promise<VerificationReceipt> {
  const components = [];
  for (const component of manifest) components.push(await executor.execute(component));
  const failed = components.some((component) => component.status === VERIFICATION_STATUS.FAIL);
  return {
    manifestDigest: digest(manifest),
    status: failed ? VERIFICATION_STATUS.FAIL : VERIFICATION_STATUS.PASS,
    components,
  };
}
