import { loadConfig } from '../config.js';
import { canonicalJson } from '../context/digest.js';
import { commonRoot, openStore } from '../db/store.js';
import { createDefaultAgentAdapterRegistry } from '../gateway/adapter-registry.js';
import { EMPTY_SIZE } from '../platform.constants.js';
import { evaluateConfiguredModels } from '../roles/model-capability-evaluation.js';
import { getCwd } from '../runtime/context.js';
import { EXIT } from './command.constants.js';
import type { Io } from './command.types.js';
import { ROLE_SUBCOMMAND } from './commands/role.constants.js';

export async function evaluateModels(args: readonly string[], io: Io): Promise<number> {
  if (args.length !== EMPTY_SIZE) {
    throw new TypeError(`${ROLE_SUBCOMMAND.EVALUATE_MODELS} takes no arguments`);
  }
  const repoRoot = commonRoot(getCwd());
  const config = loadConfig(repoRoot);
  const store = openStore(repoRoot);
  try {
    const receipts = await evaluateConfiguredModels(
      store,
      repoRoot,
      createDefaultAgentAdapterRegistry(),
      { now: new Date(), validityDays: config.modelEvaluation.evidenceValidityDays },
    );
    const valid = receipts.length > EMPTY_SIZE && receipts.every((receipt) => receipt.passed);
    io.out(canonicalJson({ valid, receipts }));
    return valid ? EXIT.OK : EXIT.GATE_FAIL;
  } finally {
    store.close();
  }
}
