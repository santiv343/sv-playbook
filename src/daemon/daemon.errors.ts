import type { TerminationReceipt } from './daemon.types.js';

/** Raised when the daemon's HTTP listener fails before accepting work. The
 *  rejection is delivered only after termination cleanup has completed; the
 *  terminal receipt is carried for diagnosis. */
export class DaemonListenError extends Error {
  readonly port: number;
  readonly receipt: TerminationReceipt;

  constructor(port: number, cause: Error, receipt: TerminationReceipt) {
    super(`daemon failed to listen on 127.0.0.1:${port}: ${cause.message}`);
    this.name = 'DaemonListenError';
    this.cause = cause;
    this.port = port;
    this.receipt = receipt;
  }
}
