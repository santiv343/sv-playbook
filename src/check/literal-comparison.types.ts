import type { LITERAL_COMPARISON_KIND } from './literal-comparison.constants.js';
import type { SourceBaseline } from './source-baseline.types.js';
import type { SourceText } from './source-tree.types.js';

export type LiteralComparisonSource = SourceText;

export interface LiteralComparisonViolation {
  readonly column: number;
  readonly fingerprint: string;
  readonly kind: typeof LITERAL_COMPARISON_KIND[keyof typeof LITERAL_COMPARISON_KIND];
  readonly line: number;
  readonly path: string;
}

export interface LiteralComparisonInventory extends SourceBaseline {
  readonly violations: readonly LiteralComparisonViolation[];
}
