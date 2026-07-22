import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS, PLAYBOOK_CONFIG_FILE_NAME } from './config.constants.js';
import { parsePlaybookConfig } from './schema/config.constants.js';
import type { PlaybookConfig } from './config.types.js';
import { NODE_ERROR_CODE, TEXT_ENCODING } from './platform.constants.js';
import { nodeErrorCode } from './platform.js';

function readConfigFile(repoRoot: string): string | undefined {
  try {
    return readFileSync(join(repoRoot, PLAYBOOK_CONFIG_FILE_NAME), TEXT_ENCODING.UTF8);
  } catch (err) {
    if (nodeErrorCode(err) === NODE_ERROR_CODE.FILE_NOT_FOUND) {
      return undefined;
    }
    throw err;
  }
}

// Sin caché a propósito: lee playbook.config.json del disco en cada
// llamada, así un cambio de config se ve reflejado de inmediato en el
// próximo comando, sin necesidad de reiniciar nada. El costo (I/O
// repetido) es aceptable porque el archivo es chico y las invocaciones
// del CLI son cortas.
// NOTA (ver findings.md F-005): `{ ...DEFAULTS }` es un shallow copy —
// los campos anidados (tasks, backup, gates, etc.) siguen siendo la
// MISMA referencia de objeto en todas las llamadas. Hoy ningún caller los
// muta (verificado), pero si alguno lo hiciera corrompería los defaults
// para todo el proceso.
export function loadConfig(repoRoot: string): PlaybookConfig {
  const text = readConfigFile(repoRoot);
  if (text === undefined) {
    return { ...DEFAULTS };
  }
  return parsePlaybookConfig(text);
}
