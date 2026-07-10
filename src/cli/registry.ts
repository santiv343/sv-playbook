import type { Command } from './command.types.js';
import { allCommands } from './commands/index.gen.js';

export function commands(): readonly Command[] {
  return allCommands;
}
