import { execFileSync } from 'node:child_process';
import { DEFAULT_GIT_BRANCH } from './store.constants.js';

export function getCurrentBranch(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export function isOnDefaultBranch(repoRoot: string): boolean {
  const branch = getCurrentBranch(repoRoot);
  if (branch === '' || branch === DEFAULT_GIT_BRANCH.MAIN || branch === DEFAULT_GIT_BRANCH.LEGACY) return true;
  try {
    const remoteRef = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    return branch === remoteRef.replace('refs/remotes/origin/', '');
  } catch {
    return false;
  }
}

export function assertMigrationBranch(repoRoot: string, migrateLive: boolean | undefined): void {
  if (isOnDefaultBranch(repoRoot)) return;
  const branch = getCurrentBranch(repoRoot);
  if (migrateLive) {
    console.error(`bypassing branch guard: migrating live from "${branch}"`);
    return;
  }
  throw new Error(`migration refused: auto-migration from non-default branch "${branch}" requires explicit live-migration opt-in`);
}
