import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { runConformance } from '../../enforcement/conformance.js';
import { CONFORMANCE_VERDICT } from '../../enforcement/conformance.constants.js';

const USAGE = 'Usage: sv-playbook enforce <contract-path> <schema-path> <profile-path>';
const ENFORCE_ARG_COUNT = 3;

export const command: Command = {
  name: 'enforce',
  summary: 'Machine-authoritative contract conformance check (read-only)',
  run(args, io): Promise<number> {
    if (args.length !== ENFORCE_ARG_COUNT) {
      io.err(USAGE);
      return Promise.resolve(EXIT.USAGE);
    }
    const contractPath = args[0];
    const schemaPath = args[1];
    const profilePath = args[2];
    if (
      contractPath === undefined
      || schemaPath === undefined
      || profilePath === undefined
    ) {
      io.err(USAGE);
      return Promise.resolve(EXIT.USAGE);
    }
    const receipt = runConformance(contractPath, schemaPath, profilePath);
    io.out(JSON.stringify(receipt, null, 2));
    return Promise.resolve(receipt.verdict === CONFORMANCE_VERDICT.CONFORMANT ? EXIT.OK : EXIT.GATE_FAIL);
  },
};
