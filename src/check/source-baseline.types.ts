import type { SOURCE_BASELINE_STATUS } from './source-baseline.constants.js';

export interface SourceBaseline {
  readonly count: number;
  readonly digest: string;
}

export interface SourceBaselineEvaluation {
  readonly message: string;
  readonly status: typeof SOURCE_BASELINE_STATUS[keyof typeof SOURCE_BASELINE_STATUS];
}
