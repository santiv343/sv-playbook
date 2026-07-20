import type { COMMAND_USAGE_VIOLATION_KIND } from './command-usage.constants.js';

// El más simple de los tipos de violación de gate — sin fingerprint (no
// hay baseline de deuda para esto, cualquier comando sin usage es rojo
// siempre).
export interface CommandUsageViolation {
  readonly kind: typeof COMMAND_USAGE_VIOLATION_KIND.MISSING;
  readonly commandName: string;
}
