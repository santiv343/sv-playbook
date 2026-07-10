import type { Command, Io } from '../command.types.js';
import { EXIT } from '../command.constants.js';
import { commonRoot, openStore, worktreeRoot } from '../../db/store.js';
import { importPackets } from '../../tasks/service.js';

export const command: Command = {
  name: 'import',
    summary: 'Import packet definitions from docs/packets/*.md into the DB',
    run(_args: string[], io: Io): Promise<number> {
      const repoRoot = commonRoot(process.cwd());
      const store = openStore(repoRoot);
      try {
        const docRoot = worktreeRoot(process.cwd());
        const result = importPackets(store, docRoot);
        io.out(`imported ${result.imported}, updated ${result.updated}`);
        return Promise.resolve(EXIT.OK);
      } finally {
        store.close();
      }
    },
};
