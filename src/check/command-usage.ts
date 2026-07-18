import type { Command } from '../cli/command.types.js';
import { COMMAND_USAGE_VIOLATION_KIND } from './command-usage.constants.js';
import type { CommandUsageViolation } from './command-usage.types.js';

export function inspectCommandUsage(commands: readonly Command[]): readonly CommandUsageViolation[] {
  return commands
    .filter((command) => command.usage.trim().length === 0)
    .map((command) => ({ kind: COMMAND_USAGE_VIOLATION_KIND.MISSING, commandName: command.name }));
}
