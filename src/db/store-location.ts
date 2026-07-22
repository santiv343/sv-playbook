import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { HASH_ENCODING, OS_PLATFORM } from '../platform.constants.js';
import { DIGEST_ALGORITHM } from './store.constants.js';

const APP_DIR_NAME = 'sv-playbook';
const REPO_ID_LENGTH = 16;

function canonicalizeRepoRoot(p: string): string {
  try {
    if (process.platform === OS_PLATFORM.WINDOWS && typeof realpathSync.native === 'function') {
      return realpathSync.native(p);
    }
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

// El hash de la raíz canonicalizada del repo es la identidad estable del
// store — dos checkouts distintos del mismo repo (o el mismo checkout
// referenciado por paths distintos) resuelven al mismo id, así que
// comparten el mismo store externo en vez de crear uno cada uno.
export function repoId(canonicalCommonRoot: string): string {
  return createHash(DIGEST_ALGORITHM.SHA256).update(canonicalCommonRoot).digest(HASH_ENCODING.HEX).slice(0, REPO_ID_LENGTH);
}

// El store vive FUERA del árbol git (carpeta de datos de app del SO:
// %LOCALAPPDATA% en Windows, XDG_DATA_HOME/~/.local/share en Unix) desde
// que se movió tras un incidente real de pérdida de datos (ver
// docs/backlog.md IDEA-033) — antes vivía en .svp/ dentro del repo, y
// operaciones destructivas de git (clean, reset --hard) podían borrarlo
// junto con el resto del working tree.
export function resolveStoreRoot(canonicalCommonRoot: string): string {
  const id = repoId(canonicalizeRepoRoot(canonicalCommonRoot));
  if (process.platform === OS_PLATFORM.WINDOWS) {
    const base = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
    return join(base, APP_DIR_NAME, id);
  }
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, APP_DIR_NAME, id);
}


