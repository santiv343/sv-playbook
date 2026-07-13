import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorkspacePort } from './workspace.types.js';

function normalizeForCompare(p: string): string {
  return process.platform === 'win32' ? realpathSync(p).toLowerCase() : realpathSync(p);
}

const gitWorkspace: WorkspacePort = {
  canonicalWorkspaceRoot(cwd: string): string | null {
    try {
      const real = realpathSync(cwd);
      return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: real, encoding: 'utf8' }).trim();
    } catch { return null; }
  },

  workspaceIdentity(root: string): string | null {
    try {
      const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
      return normalizeForCompare(resolve(root, commonDir));
    } catch { return null; }
  },

  sameWorkspace(a: string, b: string): boolean {
    const idA = this.workspaceIdentity(a);
    const idB = this.workspaceIdentity(b);
    if (idA === null || idB === null) return false;
    return idA === idB;
  },
};

export { gitWorkspace };
