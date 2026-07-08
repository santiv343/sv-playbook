import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commonRoot } from '../../db/store.js';
import { createStateBackup, restoreStateBackup } from '../../db/backup.js';
import { BACKUP_REASON } from '../../db/backup.constants.js';
import { BACKUP_USAGE, RESTORE_USAGE, STATE_SUBCOMMAND } from './backup.constants.js';
import { loadConfig } from '../../config.js';

export function backupCommand(): Command {
  return {
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
        const repoRoot = commonRoot(process.cwd());
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
}

export function restoreCommand(): Command {
  return {
    name: 'restore',
    summary: 'Restore local SQLite state from a snapshot',
    run(args, io): Promise<number> {
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
        const repoRoot = commonRoot(process.cwd());
        const config = loadConfig(repoRoot);
        const report = restoreStateBackup(repoRoot, parsed.values.file, parsed.values.force === true, config.backup.retention);
        io.out(`restored: ${report.restoredFrom}`);
        io.out(`pre-restore backup: ${report.preRestoreBackup.sqlitePath}`);
        return Promise.resolve(EXIT.OK);
      } catch (error) {
        io.err(`error: ${error instanceof Error ? error.message : String(error)}`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }
    },
  };
}
