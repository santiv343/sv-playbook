import { execFileSync } from 'node:child_process';
import { GIT_ARGUMENT, GIT_EXECUTABLE } from '../git.constants.js';
import { PROCESS_STDIO, TEXT_ENCODING } from '../platform.constants.js';
import { PROMOTION_ERROR } from './promotion.constants.js';
import { PromotionError } from './promotion.errors.js';
import type { GitPromotionPort } from './promotion.types.js';

const GIT_COMMAND = {
  CHECK_REF_FORMAT: 'check-ref-format',
  UPDATE_REF: 'update-ref',
} as const;

function output(repoRoot: string, args: readonly string[]): string {
  return execFileSync(GIT_EXECUTABLE, args, {
    cwd: repoRoot,
    encoding: TEXT_ENCODING.UTF8,
    stdio: PROCESS_STDIO.PIPE,
  }).trim();
}

function branchRef(repoRoot: string, targetRef: string): string {
  try {
    execFileSync(GIT_EXECUTABLE, [GIT_COMMAND.CHECK_REF_FORMAT, GIT_ARGUMENT.BRANCH, targetRef], {
      cwd: repoRoot,
      encoding: TEXT_ENCODING.UTF8,
      stdio: PROCESS_STDIO.PIPE,
    });
  } catch {
    throw new PromotionError(PROMOTION_ERROR.INPUT_INVALID, `invalid local target branch: ${targetRef}`);
  }
  return `refs/heads/${targetRef}`;
}

export function createLocalGitPromotionPort(): GitPromotionPort {
  return LOCAL_PORT;
}

const LOCAL_PORT: GitPromotionPort = {
  headSha: (worktree) => output(worktree, [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.HEAD]),
  refSha: (repoRoot, targetRef) => output(repoRoot, [
    GIT_ARGUMENT.REV_PARSE,
    GIT_ARGUMENT.VERIFY,
    branchRef(repoRoot, targetRef),
  ]),
  isAncestor: (repoRoot, ancestorSha, descendantSha) => {
    try {
      execFileSync(GIT_EXECUTABLE, [GIT_ARGUMENT.MERGE_BASE, GIT_ARGUMENT.IS_ANCESTOR, ancestorSha, descendantSha], {
        cwd: repoRoot,
        encoding: TEXT_ENCODING.UTF8,
        stdio: PROCESS_STDIO.PIPE,
      });
      return true;
    } catch {
      return false;
    }
  },
  // `git update-ref <ref> <new> <old>` es una operación compare-and-swap:
  // sólo mueve el ref si ACTUALMENTE apunta a `beforeSha` — si alguien más
  // integró algo a `targetRef` entre que PromotionController leyó su SHA
  // y este momento, el comando falla en vez de sobreescribir ese trabajo
  // ajeno. Es la garantía real de que "integrar" nunca pisa un commit que
  // no vio.
  fastForwardRef: (repoRoot, targetRef, beforeSha, candidateSha) => {
    execFileSync(GIT_EXECUTABLE, [
      GIT_COMMAND.UPDATE_REF,
      branchRef(repoRoot, targetRef),
      candidateSha,
      beforeSha,
    ], {
      cwd: repoRoot,
      encoding: TEXT_ENCODING.UTF8,
      stdio: PROCESS_STDIO.PIPE,
    });
  },
};
