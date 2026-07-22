import type { LITERAL_COMPARISON_KIND } from './literal-comparison.constants.js';
import type { SourceBaseline } from './source-baseline.types.js';
import type { SourceText } from './source-tree.types.js';

export type LiteralComparisonSource = SourceText;

// Mismo patrón que duplicate-string.types.ts — un solo `kind` posible hoy
// (NUMBER), el campo existe para cuando se agreguen otros tipos de
// comparación literal (string, boolean) sin cambiar la forma.
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
