import type { SOURCE_BASELINE_STATUS } from './source-baseline.constants.js';

// El shape mínimo compartido por TODOS los inventarios de deuda (duplicate
// strings, comparaciones literales, ORM boundary) — count+digest es
// suficiente para detectar "algo cambió" sin acoplar source-baseline.ts al
// tipo de violación concreto de cada gate.
export interface SourceBaseline {
  readonly count: number;
  readonly digest: string;
}

export interface SourceBaselineEvaluation {
  readonly message: string;
  readonly status: typeof SOURCE_BASELINE_STATUS[keyof typeof SOURCE_BASELINE_STATUS];
}
