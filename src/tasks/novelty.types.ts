export interface NoveltyCheckInput {
  readonly candidateWriteSet: readonly string[];
  readonly priorWriteSets: readonly (readonly string[])[];
}

export interface NoveltyResult {
  readonly isNovel: boolean;
  readonly newPatterns: readonly string[];
}
