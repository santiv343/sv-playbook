import { EXIT } from './command.constants.js';
import type { Io } from './command.types.js';
import type { DaemonOutcome } from '../daemon/daemon.types.js';

export function daemonOutcomeToExitCode(outcome: DaemonOutcome, io: Io): number {
  if (outcome.kind === 'stopped') return EXIT.OK;
  io.err('Daemon terminated unexpectedly');
  return EXIT.SYSTEM;
}
