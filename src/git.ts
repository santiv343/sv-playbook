import { execFileSync } from 'node:child_process';
import { GIT_ARGUMENT, GIT_EXECUTABLE, PROCESS_STDIO } from './git.constants.js';
import { TEXT_ENCODING } from './platform.constants.js';

interface GitOutputOptions {
  readonly maxBuffer?: number;
}

export function gitOutput(
  worktree: string,
  args: readonly string[],
  options: GitOutputOptions = {},
): string {
  return execFileSync(GIT_EXECUTABLE, args, {
    cwd: worktree,
    encoding: TEXT_ENCODING.UTF8,
    maxBuffer: options.maxBuffer,
    stdio: PROCESS_STDIO.PIPE,
  }).trim();
}

export function resolveGitMergeBase(
  worktree: string,
  baseReference: string,
  options: GitOutputOptions = {},
): string {
  return gitOutput(worktree, [GIT_ARGUMENT.MERGE_BASE, baseReference, GIT_ARGUMENT.HEAD], options);
}

// Diff de "tres puntos" (`mergeBase...HEAD`), no un diff directo contra
// `baseReference`: compara HEAD contra el punto donde la rama actual se
// separó de la base, no contra la punta actual de la base. Esto importa
// si `baseReference` avanzó después de que la rama se creó — un diff
// directo mostraría también los cambios que la base sumó mientras tanto
// (que no son responsabilidad de esta rama); el diff de tres puntos no.
// Es lo que usan gateReview (flujo 3) y el candidato de review (flujo 4)
// para saber "qué tocó REALMENTE esta rama".
export function changedFilesForBase(worktree: string, baseReference: string): string[] {
  const mergeBase = resolveGitMergeBase(worktree, baseReference);
  const output = gitOutput(worktree, [
    GIT_ARGUMENT.DIFF,
    GIT_ARGUMENT.NAME_ONLY,
    `${mergeBase}...${GIT_ARGUMENT.HEAD}`,
  ]);
  return output === '' ? [] : output.split('\n').filter(Boolean);
}
