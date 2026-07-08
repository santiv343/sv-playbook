import type { Command } from './command.js';
import { docsCommand } from './commands/docs.js';
import { taskCommand } from './commands/task.js';
import { describeCommand } from './commands/describe.js';

export const commands: readonly Command[] = [docsCommand, taskCommand, describeCommand];
