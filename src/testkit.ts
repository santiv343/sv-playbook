import { execFileSync } from 'node:child_process';
import { GIT_EXECUTABLE } from './git.constants.js';
import { DEFAULT_GIT_BRANCH } from './db/store.constants.js';
import { PROCESS_STDIO } from './platform.constants.js';

// Test repos must never inherit the host's init.defaultBranch: CI images leave
// it unset (so repos land on 'master'), which breaks every code path that diffs
// against the configured main base reference.
export function initTestRepo(root: string): void {
  execFileSync(GIT_EXECUTABLE, ['init', '-b', DEFAULT_GIT_BRANCH.MAIN], {
    cwd: root,
    stdio: PROCESS_STDIO.IGNORE,
  });
}
