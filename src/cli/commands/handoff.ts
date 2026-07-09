import type { Command, Io } from '../command.types.js';
import { EXIT } from '../command.constants.js';

export function handoffCommand(): Command {
  return {
    name: 'handoff',
    summary: 'Generate a deterministic continuation prompt from live state',
    run(_args: string[], io: Io): Promise<number> {
      io.out('stub');
      return Promise.resolve(EXIT.OK);
    },
  };
}
