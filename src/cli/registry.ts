import type { Command } from './command.types.js';
import { docsCommand } from './commands/docs.js';
import { taskCommand } from './commands/task.js';
import { describeCommand } from './commands/describe.js';
import { rebuildCommand } from './commands/rebuild.js';

export function commands(): readonly Command[] {
  return [docsCommand(), taskCommand(), describeCommand(), rebuildCommand()];
}
