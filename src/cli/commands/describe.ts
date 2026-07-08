import { EXIT, type Command } from '../command.js';
import { commands } from '../registry.js';

export const describeCommand: Command = {
  name: 'describe',
  summary: 'Print a machine-readable JSON catalog of all commands',
  run(args, io): Promise<number> {
    if (args.length > 0) {
      io.err('Usage: sv-playbook describe');
      return Promise.resolve(EXIT.USAGE);
    }
    const catalog = commands.map((c) => ({ name: c.name, summary: c.summary }));
    io.out(JSON.stringify(catalog));
    return Promise.resolve(EXIT.OK);
  },
};
