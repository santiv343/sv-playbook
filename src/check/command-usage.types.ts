import type { COMMAND_USAGE_VIOLATION_KIND } from './command-usage.constants.js';

export interface CommandUsageViolation {
  readonly kind: typeof COMMAND_USAGE_VIOLATION_KIND.MISSING;
  readonly commandName: string;
}
