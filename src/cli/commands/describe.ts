import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commands } from '../registry.js';

// La implementación literal de "CLI autodescubrible" (PRINCIPLE del mismo
// nombre, ver content/principles.md) — un agente puede listar TODOS los
// comandos y sus usage strings sin parsear `--help` de texto libre, sólo
// llamando `sv-playbook describe` y leyendo JSON. Se apoya en el mismo
// registry (commands()) que genera index.gen.ts — no hay una lista
// separada de "comandos documentados" que pueda desincronizarse del
// registry real.
export const command: Command = {
  name: 'describe',
  summary: 'Print a machine-readable JSON catalog of all commands',
  usage: 'Usage: sv-playbook describe',
  run(args, io): Promise<number> {
    if (args.length > 0) {
      io.err(command.usage);
      return Promise.resolve(EXIT.USAGE);
    }
    const catalog = commands().map((c) => ({ name: c.name, summary: c.summary, usage: c.usage }));
    io.out(JSON.stringify(catalog));
    return Promise.resolve(EXIT.OK);
  },
};
