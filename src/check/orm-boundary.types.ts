import type { ORM_BOUNDARY_VIOLATION } from './orm-boundary.constants.js';
import type { SourceBaseline, SourceBaselineEvaluation } from './source-baseline.types.js';

export type OrmBoundaryViolationKind =
  typeof ORM_BOUNDARY_VIOLATION[keyof typeof ORM_BOUNDARY_VIOLATION];

// OrmBoundaryInventory NO extiende SourceBaseline como sus hermanos (lo
// redeclara con los mismos 3 campos) — inconsistencia cosmética, no
// funcional, entre este archivo y duplicate-string.types.ts/literal-comparison.types.ts.
export interface OrmBoundarySource {
  readonly path: string;
  readonly source: string;
}

export interface OrmBoundaryViolation {
  readonly column: number;
  readonly fingerprint: string;
  readonly kind: OrmBoundaryViolationKind;
  readonly line: number;
  readonly path: string;
}

export interface OrmBoundaryInventory {
  readonly count: number;
  readonly digest: string;
  readonly violations: readonly OrmBoundaryViolation[];
}

export type OrmBoundaryBaseline = SourceBaseline;
export type OrmBoundaryBaselineEvaluation = SourceBaselineEvaluation;
