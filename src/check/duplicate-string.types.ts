import type { SourceBaseline } from './source-baseline.types.js';
import type { SourceText } from './source-tree.types.js';

export type DuplicateStringSource = SourceText;

// DuplicateStringInventory extiende SourceBaseline (count+digest) — el
// mismo shape que comparten literal-comparison/orm-boundary, así
// evaluateSourceBaseline es genérico sobre los 3 gates sin acoplarse al
// tipo específico de violación.
export interface DuplicateStringViolation {
  readonly column: number;
  readonly fingerprint: string;
  readonly line: number;
  readonly path: string;
  readonly value: string;
}

export interface DuplicateStringInventory extends SourceBaseline {
  readonly violations: readonly DuplicateStringViolation[];
}
