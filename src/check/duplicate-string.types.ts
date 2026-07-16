import type { SourceBaseline } from './source-baseline.types.js';
import type { SourceText } from './source-tree.types.js';

export type DuplicateStringSource = SourceText;

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
