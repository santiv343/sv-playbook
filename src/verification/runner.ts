import { digest } from '../context/digest.js';
import { VERIFICATION_MANIFEST, VERIFICATION_STATUS } from './verification.constants.js';
import type {
  VerificationComponent,
  VerificationExecutor,
  VerificationReceipt,
} from './verification.types.js';

// Corre cada componente del manifiesto (typecheck, lint, test, gates
// propios) secuencialmente vía el executor inyectado — cualquiera falla y
// el resultado global es FAIL. manifestDigest ata el receipt a la versión
// exacta del manifiesto que corrió, para poder detectar si "verify pasó"
// se refiere a un conjunto de chequeos desactualizado.
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
