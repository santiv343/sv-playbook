import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commands } from '../registry.js';

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
