// priorWriteSets es un array de arrays (un write_set por packet existente)
// — detectNovelty (novelty.ts) los aplana todos antes de comparar, así que
// esta forma cruda existe sólo para que el caller (checkpoint-gate.ts) no
// tenga que aplanar él mismo.
export interface NoveltyCheckInput {
  readonly candidateWriteSet: readonly string[];
  readonly priorWriteSets: readonly (readonly string[])[];
}

export interface NoveltyResult {
  readonly isNovel: boolean;
  readonly newPatterns: readonly string[];
}
