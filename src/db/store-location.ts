import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OS_PLATFORM } from '../platform.constants.js';

const APP_DIR_NAME = 'sv-playbook';
const REPO_ID_LENGTH = 16;

export function repoId(canonicalCommonRoot: string): string {
  return createHash('sha256').update(canonicalCommonRoot).digest('hex').slice(0, REPO_ID_LENGTH);
}

export function resolveStoreRoot(canonicalCommonRoot: string): string {
  const id = repoId(canonicalCommonRoot);
  if (process.platform === OS_PLATFORM.WINDOWS) {
    const base = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
    return join(base, APP_DIR_NAME, id);
  }
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, APP_DIR_NAME, id);
}
