import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commonRoot } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { createStateBackup } from '../../db/backup.js';
import { BACKUP_REASON } from '../../db/backup.constants.js';
import { BACKUP_USAGE, STATE_SUBCOMMAND } from './backup.constants.js';
import { loadConfig } from '../../config.js';

export const command: Command = {
  name: 'backup',
  summary: 'Create local SQLite state snapshots',
  run(args, io): Promise<number> {
    const [sub, ...rest] = args;
    if (sub !== STATE_SUBCOMMAND) {
      io.err(BACKUP_USAGE);
      return Promise.resolve(EXIT.USAGE);
    }
    const parsed = parseArgs({ args: rest, allowPositionals: true, options: { force: { type: 'boolean' } } });
    if (parsed.positionals.length > 0) {
      io.err(BACKUP_USAGE);
      return Promise.resolve(EXIT.USAGE);
    }
    try {
      const repoRoot = commonRoot(getCwd());
      const config = loadConfig(repoRoot);
      const report = createStateBackup(repoRoot, {
        reason: BACKUP_REASON.MANUAL,
        allowFreshLeases: parsed.values.force === true,
        retention: config.backup.retention,
      });
      io.out(`backup: ${report.sqlitePath}`);
      io.out(`metadata: ${report.metadataPath}`);
      return Promise.resolve(EXIT.OK);
    } catch (error) {
      io.err(`error: ${error instanceof Error ? error.message : String(error)}`);
      return Promise.resolve(EXIT.GATE_FAIL);
    }
  },
};
