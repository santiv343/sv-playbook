import { parseArgs } from 'node:util';
import { CLI_OPTION_TYPE, EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStoreReadOnly } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import {
  formatCountsHeader,
  formatFooter,
  formatStatusTable,
  readBoardStatus,
} from '../../status/status.js';
import type { BoardStatus } from '../../status/status.types.js';

const USAGE = 'Usage: sv-playbook status [--json]';

function renderStatus(status: BoardStatus, io: Io): void {
  io.out(formatCountsHeader(status.counts));
  io.out('');
  for (const line of formatStatusTable(status.packets)) {
    io.out(line);
  }
  io.out('');
  for (const line of formatFooter(status.backup, status.packets)) {
    io.out(line);
  }
}

// Comando de sólo lectura: usa openStoreReadOnly (no toma el lock exclusivo
// del daemon) para que `status` funcione incluso con el daemon corriendo o
// con otro proceso escribiendo — es lo primero que corre un humano o un
// agente para orientarse, no puede depender de que nada más esté quieto.
export const command: Command = {
  name: 'status',
  summary: 'Print board, lease, event, and backup status',
  usage: USAGE,
  run(args, io): Promise<number> {
      const parsed = parseArgs({ args, allowPositionals: true, options: { json: { type: CLI_OPTION_TYPE.BOOLEAN } } });
      if (parsed.positionals.length > 0) {
        io.err(USAGE);
        return Promise.resolve(EXIT.USAGE);
      }
      // commonRoot(getCwd()) — no repoRoot literal: getCwd() respeta el
      // contexto forwardeado por el daemon (ver runtime/context.ts) cuando
      // este comando llega reenviado desde otro cwd.
      const repoRoot = commonRoot(getCwd());
      const store = openStoreReadOnly(repoRoot);
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
