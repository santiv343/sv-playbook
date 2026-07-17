import type { NoveltyCheckInput, NoveltyResult } from './novelty.types.js';

export function detectNovelty({ candidateWriteSet, priorWriteSets }: NoveltyCheckInput): NoveltyResult {
  const seen = new Set(priorWriteSets.flat());
  const newPatterns = candidateWriteSet.filter((pattern) => !seen.has(pattern));
  return { isNovel: Boolean(newPatterns.length), newPatterns };
}
