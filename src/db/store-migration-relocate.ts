import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { DB_FILE, SVP_DIR } from './store.constants.js';
import { resolveStoreRoot } from './store-location.js';

const DB_FILES = [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`] as const;

// ⚠️ Ver findings.md F-008 (confirmado en vivo en el propio repo de
// sv-playbook): si el destino externo YA existe, esta función retorna
// sin tocar nada — el archivo viejo en `.svp/` queda huérfano,
// congelado, sin aviso. Gitignored (no hay riesgo de commitearlo), pero
// sigue siendo una trampa real: alguien que inspeccione `.svp/playbook.sqlite`
// a mano puede pensar que ve el store vivo cuando en realidad es un
// duplicado stale — el store real vive en resolveStoreRoot() (fuera del
// repo). No se limpia ni se advierte, sólo se ignora.
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
