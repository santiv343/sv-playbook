import { createHash, randomUUID } from 'node:crypto';
import { closeSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { NODE_ERROR_CODE } from '../platform.constants.js';
import { nodeErrorCode } from '../platform.js';

export function generateToken(): string {
  return createHash('sha256').update(randomUUID()).digest('hex').slice(0, 32);
}

function writeLockFileAtomically(lockPath: string, pid: number, port: number, nonce: string): void {
  const fd = openSync(lockPath, 'wx', 0o600);
  try {
    writeSync(fd, `${pid}\n${port}\n${new Date().toISOString()}\n${nonce}\n`);
  } finally {
    closeSync(fd);
  }
}

// El "single blessed writer" del daemon se implementa con el flag `wx` de
// openSync — crea el archivo SÓLO si no existe, atómico a nivel de SO. Es
// el mismo patrón compare-and-swap documentado en architecture.md, pero vía
// filesystem en vez de SQL o git: si dos procesos intentan acquireLock() al
// mismo tiempo, el SO garantiza que sólo uno gana (ALREADY_EXISTS para el
// perdedor), sin necesitar ningún lock adicional de aplicación.
export function acquireLock(lockPath: string, pid: number, port: number, nonce: string): void {
  try {
    writeLockFileAtomically(lockPath, pid, port, nonce);
  } catch (err: unknown) {
    const isExisting = nodeErrorCode(err) === NODE_ERROR_CODE.ALREADY_EXISTS;
    const message = isExisting
      ? 'daemon is already running for this repo (lock file race)'
      : `failed to create lock file: ${String(err)}`;
    throw new Error(message);
  }
}

export function removeLock(lockPath: string): void {
  try { unlinkSync(lockPath); } catch { /* best-effort */ }
}
