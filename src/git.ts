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

export function changedFilesForBase(worktree: string, baseReference: string): string[] {
  const mergeBase = resolveGitMergeBase(worktree, baseReference);
  const output = gitOutput(worktree, [
    GIT_ARGUMENT.DIFF,
    GIT_ARGUMENT.NAME_ONLY,
    `${mergeBase}...${GIT_ARGUMENT.HEAD}`,
  ]);
  return output === '' ? [] : output.split('\n').filter(Boolean);
}
