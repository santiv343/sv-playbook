import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { restoreStateBackup } from '../../db/backup.js';
import { RESTORE_USAGE, STATE_SUBCOMMAND } from './backup.constants.js';
import { loadConfig } from '../../config.js';
import { checkDestructiveGate, queryDestructiveCounts } from '../destructive-gate.js';

export const command: Command = {
  name: 'restore',
  summary: 'Restore local SQLite state from a snapshot',
  destructive: true,
  run(args, io): Promise<number> {
    const CONFIRM_FLAG = '--confirm-destructive';
    const hasConfirm = args.includes(CONFIRM_FLAG);
    if (hasConfirm) args = args.filter((a) => a !== CONFIRM_FLAG);

    const repoRoot = commonRoot(process.cwd());
    const gateResult = checkDestructiveGate(io, 'restore', repoRoot, hasConfirm, queryDestructiveCounts(repoRoot));
    if (gateResult !== undefined) return gateResult;

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
