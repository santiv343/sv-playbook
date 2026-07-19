import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SVP_DIR } from './store.constants.js';
import { resolveStoreRoot } from './store-location.js';

export function relocateStoreIfNeeded(repoRoot: string, commonRootPath: string): void {
  const inTreePath = join(repoRoot, SVP_DIR);
  if (!existsSync(inTreePath)) return;
  const externalPath = resolveStoreRoot(commonRootPath);
  if (existsSync(externalPath)) return;
  mkdirSync(dirname(externalPath), { recursive: true });
  renameSync(inTreePath, externalPath);
}
