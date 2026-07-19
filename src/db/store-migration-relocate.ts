import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { DB_FILE, SVP_DIR } from './store.constants.js';
import { resolveStoreRoot } from './store-location.js';

const DB_FILES = [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`] as const;

export function relocateStoreIfNeeded(repoRoot: string, commonRootPath: string): void {
  const inTreePath = join(repoRoot, SVP_DIR);
  if (!existsSync(inTreePath)) return;
  const externalPath = resolveStoreRoot(commonRootPath);
  if (existsSync(externalPath)) return;
  mkdirSync(externalPath, { recursive: true });
  for (const file of DB_FILES) {
    const source = join(inTreePath, file);
    if (existsSync(source)) {
      renameSync(source, join(externalPath, file));
    }
  }
}
