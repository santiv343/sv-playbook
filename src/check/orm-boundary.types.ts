import type { ORM_BOUNDARY_VIOLATION } from './orm-boundary.constants.js';
import type { SourceBaseline, SourceBaselineEvaluation } from './source-baseline.types.js';

export type OrmBoundaryViolationKind =
  typeof ORM_BOUNDARY_VIOLATION[keyof typeof ORM_BOUNDARY_VIOLATION];

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
