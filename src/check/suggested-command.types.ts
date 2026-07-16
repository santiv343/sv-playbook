import type { SUGGESTED_COMMAND_KIND } from './suggested-command.constants.js';

export type SuggestedCommandKind = (typeof SUGGESTED_COMMAND_KIND)[keyof typeof SUGGESTED_COMMAND_KIND];

export interface SuggestedCommandSource {
  readonly path: string;
  readonly source: string;
}

export interface CommandSurface {
  readonly flags: ReadonlySet<string>;
  readonly names: ReadonlySet<string>;
  readonly positionals: ReadonlySet<string>;
  readonly subcommands: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface SuggestedCommandViolation {
  readonly column: number;
  readonly context: string;
  readonly kind: SuggestedCommandKind;
  readonly line: number;
  readonly path: string;
  readonly value: string;
}

export interface SuggestedCommandInventory {
  readonly count: number;
  readonly violations: readonly SuggestedCommandViolation[];
}
