import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HASH_ENCODING, OS_PLATFORM } from '../platform.constants.js';
import { DIGEST_ALGORITHM } from './store.constants.js';

const APP_DIR_NAME = 'sv-playbook';
const REPO_ID_LENGTH = 16;

export function repoId(canonicalCommonRoot: string): string {
  return createHash(DIGEST_ALGORITHM.SHA256).update(canonicalCommonRoot).digest(HASH_ENCODING.HEX).slice(0, REPO_ID_LENGTH);
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


