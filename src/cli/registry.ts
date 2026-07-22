import type { Command } from './command.types.js';
import { allCommands } from './commands/index.gen.js';
import { command as config } from './commands/config.js';
import { command as decision } from './commands/decision.js';
import { command as packet } from './commands/packet.js';

// `index.gen.ts` no se edita a mano: `generate-index.ts` escanea
// src/cli/commands/*.ts (todo lo que no sea .test/.constants/.types/.errors/
// fixture) y genera el import + el array `allCommands` automáticamente. Este
// es el mecanismo real detrás de "el CLI es autodescubrible" (PRINCIPLE-011
// aplicado a la forma del CLI) — nadie mantiene una lista de comandos a mano.
const FIXTURE_PREFIX = '__';
const FIXTURE_SUFFIX = '__';

// Los comandos de fixture (nombre entre __dobles guiones bajos__) existen
// sólo para que los tests de registry/main tengan un Command de juguete —
// nunca deben aparecer en la lista real que ve un usuario.
function isFixtureName(name: string): boolean {
  return name.startsWith(FIXTURE_PREFIX) && name.endsWith(FIXTURE_SUFFIX);
}

// config/decision/packet ya deberían venir incluidos por el escaneo
// automático (son archivos .ts normales en commands/); este push es una red
// de seguridad defensiva por si `index.gen.ts` quedó desactualizado respecto
// al build actual — no duplica si ya están.
export function commands(): readonly Command[] {
  const base: Command[] = [...allCommands.filter((c) => !isFixtureName(c.name))];
  if (!base.some((c) => c.name === config.name)) base.push(config);
  if (!base.some((c) => c.name === decision.name)) base.push(decision);
  if (!base.some((c) => c.name === packet.name)) base.push(packet);
  return base;
}
