import type { Command } from './command.js';
import { docsCommand } from './commands/docs.js';

export const commands: readonly Command[] = [docsCommand];
