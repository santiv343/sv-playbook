import type { TerminationReceipt } from './daemon.types.js';

/** Raised when the daemon's HTTP listener fails before accepting work. The
 *  rejection is delivered only after termination cleanup has completed; the
 *  terminal receipt is carried for diagnosis. */
// Cargar el receipt de terminación en el propio error es deliberado: quien
// atrapa este error (bin/sv-playbook.js o quien haya llamado startDaemon)
// necesita saber CÓMO terminó la limpieza (finalizeOnce, daemon.lifecycle.ts)
// sin tener que ir a buscarlo por separado — el error de "no pude escuchar"
// y el "cómo quedó todo después de limpiar" viajan juntos.
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
