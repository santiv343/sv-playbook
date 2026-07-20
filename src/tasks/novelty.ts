import type { NoveltyCheckInput, NoveltyResult } from './novelty.types.js';

// El detector real detrás del checkpoint de complejidad (checkpoint-gate.ts):
// "novedoso" significa que el write_set candidato incluye al menos un path
// que NUNCA apareció en ningún write_set previo de ningún otro packet —
// `seen` aplana TODOS los write_sets anteriores en un único set, así que
// da igual cuántos packets haya, la comparación es O(1) por entrada del
// candidato.
export function detectNovelty({ candidateWriteSet, priorWriteSets }: NoveltyCheckInput): NoveltyResult {
  const seen = new Set(priorWriteSets.flat());
  const newPatterns = candidateWriteSet.filter((pattern) => !seen.has(pattern));
  return { isNovel: Boolean(newPatterns.length), newPatterns };
}
