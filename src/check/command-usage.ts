import type { Command } from '../cli/command.types.js';
import { COMMAND_USAGE_VIOLATION_KIND } from './command-usage.constants.js';
import type { CommandUsageViolation } from './command-usage.types.js';

// Gate mínimo del principio "self-discoverable CLI": todo Command
// declarado en el registry (src/cli/registry.ts) tiene que traer su
// propio `usage` no vacío — es lo que le permite a `main()` mostrar
// ayuda útil sin mantener una lista aparte de textos de uso por comando.
export function inspectCommandUsage(commands: readonly Command[]): readonly CommandUsageViolation[] {
  return commands
    .filter((command) => command.usage.trim().length === 0)
    .map((command) => ({ kind: COMMAND_USAGE_VIOLATION_KIND.MISSING, commandName: command.name }));
}
