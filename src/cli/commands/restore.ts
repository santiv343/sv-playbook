import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { restoreStateBackup } from '../../db/backup.js';
import { RESTORE_USAGE, STATE_SUBCOMMAND } from './backup.constants.js';
import { loadConfig } from '../../config.js';

// `destructive: true` en la definición del Command es lo que engancha
// destructive-gate.ts (ver flujo de gates destructivos) — restaurar
// SIEMPRE toma un backup del estado actual primero (restoreStateBackup en
// db/backup.ts), así que "destructivo" acá es sobre el efecto neto
// (reemplaza el store en vivo), no sobre falta de red de seguridad.
export const command: Command = {
  name: 'restore',
  summary: 'Restore local SQLite state from a snapshot',
  usage: RESTORE_USAGE,
  destructive: true,
  run(args, io): Promise<number> {
    const repoRoot = commonRoot(getCwd());
    const [sub, ...rest] = args;
    if (sub !== STATE_SUBCOMMAND) {
      io.err(RESTORE_USAGE);
      return Promise.resolve(EXIT.USAGE);
    }
    const parsed = parseArgs({ args: rest, allowPositionals: true, options: { file: { type: 'string' }, force: { type: 'boolean' } } });
    if (parsed.positionals.length > 0 || typeof parsed.values.file !== 'string' || parsed.values.file === '') {
      io.err(RESTORE_USAGE);
      return Promise.resolve(EXIT.USAGE);
    }
    try {
      const config = loadConfig(repoRoot);
      const report = restoreStateBackup(repoRoot, parsed.values.file, parsed.values.force === true, config.backup.retention);
      openStore(repoRoot).close();
      io.out(`restored: ${report.restoredFrom}`);
      io.out(`pre-restore backup: ${report.preRestoreBackup.sqlitePath}`);
      return Promise.resolve(EXIT.OK);
    } catch (error) {
      io.err(`error: ${error instanceof Error ? error.message : String(error)}`);
      return Promise.resolve(EXIT.GATE_FAIL);
    }
  },
};
