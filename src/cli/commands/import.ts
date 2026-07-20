import type { Command, Io } from '../command.types.js';
import { EXIT } from '../command.constants.js';
import { commonRoot, openStore, worktreeRoot } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { importPackets } from '../../tasks/service.js';

// `import` es el complemento de `rebuild` (rebuild.ts) pero incremental —
// mientras rebuild reconstruye la DB entera desde cero, `import` corre
// importPackets (tasks/service.ts) para sincronizar sólo packets nuevos o
// modificados en docs/packets/*.md hacia la DB, devolviendo cuántos se
// importaron vs actualizaron. Es el camino normal para traer de vuelta
// packets creados/editados a mano en el .md fuera del CLI.
export const command: Command = {
  name: 'import',
  summary: 'Import packet definitions from docs/packets/*.md into the DB',
  usage: 'Usage: sv-playbook import',
  run(_args: string[], io: Io): Promise<number> {
      const repoRoot = commonRoot(getCwd());
      const store = openStore(repoRoot);
      try {
        const docRoot = worktreeRoot(getCwd());
        const result = importPackets(store, docRoot);
        io.out(`imported ${result.imported}, updated ${result.updated}`);
        return Promise.resolve(EXIT.OK);
      } finally {
        store.close();
      }
    },
};
