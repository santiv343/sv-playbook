import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { rebuildFromFiles, refuseRebuild } from '../../tasks/service.js';
import { commonRoot, openStore } from '../../db/store.js';

export function rebuildCommand(): Command {
  return {
    name: 'rebuild',
    summary: 'Rebuild the packet database from the markdown files in docs/packets/',
    run(args, io): Promise<number> {
      const parsed = parseArgs({
        args,
        allowPositionals: true,
        options: { force: { type: 'boolean' } },
      });
      if (parsed.positionals.length > 0) {
        io.err('Usage: sv-playbook rebuild [--force]');
        return Promise.resolve(EXIT.USAGE);
      }
      const repoRoot = commonRoot(process.cwd());
      const store = openStore(repoRoot, { skipVersionCheck: true });
      try {
        const refusal = refuseRebuild(store);
        if (refusal !== undefined && parsed.values.force !== true) {
          io.err(refusal);
          return Promise.resolve(EXIT.GATE_FAIL);
        }
      } finally {
        store.close();
      }
      const counts = rebuildFromFiles(repoRoot);
      io.out(`rebuilt: ${counts.total} packets (${counts.done} done, ${counts.dropped} dropped, ${counts.draft} draft)`);
      return Promise.resolve(EXIT.OK);
    },
  };
}
