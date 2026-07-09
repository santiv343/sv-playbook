import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { formatHumanStatus, readBoardStatus } from '../../status/status.js';
import type { BoardStatus } from '../../status/status.types.js';

const USAGE = 'Usage: sv-playbook status [--json]';

function renderStatus(status: BoardStatus, io: Io): void {
  io.out(formatHumanStatus(status));
}

export function statusCommand(): Command {
  return {
    name: 'status',
    summary: 'Print board, lease, event, and backup status',
    run(args, io): Promise<number> {
      const parsed = parseArgs({ args, allowPositionals: true, options: { json: { type: 'boolean' } } });
      if (parsed.positionals.length > 0) {
        io.err(USAGE);
        return Promise.resolve(EXIT.USAGE);
      }
      const repoRoot = commonRoot(process.cwd());
      const store = openStore(repoRoot);
      try {
        const status = readBoardStatus(store, repoRoot);
        if (parsed.values.json === true) io.out(JSON.stringify(status));
        else renderStatus(status, io);
        return Promise.resolve(EXIT.OK);
      } finally {
        store.close();
      }
    },
  };
}
