import { EXIT } from '../../cli/command.constants.js';
import type { Io } from '../../cli/command.types.js';
import type { DaemonOutcome } from '../daemon.types.js';

export function daemonOutcomeToExitCode(outcome: DaemonOutcome, io: Io): number {
  if (outcome.kind === 'stopped') return EXIT.OK;
  io.err('Daemon terminated unexpectedly');
  return EXIT.SYSTEM;
}
