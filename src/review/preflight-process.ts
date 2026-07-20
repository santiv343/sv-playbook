import { spawn } from 'node:child_process';
import { PROCESS_STDIO } from '../git.constants.js';
import { PROCESS_EVENT, TEXT_ENCODING } from '../platform.constants.js';
import { detachProcessTree, terminateProcessTree } from '../platform.js';
import { PREFLIGHT_VERIFY_OUTPUT_TAIL_CHARACTERS } from './preflight.constants.js';
import type { VerifyProcessResult } from './preflight.types.js';

function outputTail(current: string, chunk: string): string {
  return `${current}${chunk}`.slice(-PREFLIGHT_VERIFY_OUTPUT_TAIL_CHARACTERS);
}

// Timeout de "sin output", no de duración total: resetTimer() se reinicia
// en CADA chunk de stdout/stderr, así que un comando de verify que tarda
// mucho pero sigue imprimiendo progreso nunca dispara el timeout — sólo lo
// dispara quedarse en silencio noOutputTimeoutMs. outputTail() sólo retiene
// los últimos N caracteres (PREFLIGHT_VERIFY_OUTPUT_TAIL_CHARACTERS) para no
// acumular un log gigante en memoria.
export function executePreflightCommand(
  command: string,
  worktree: string,
  noOutputTimeoutMs: number,
): Promise<VerifyProcessResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let tail = '';
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout;
    const child = spawn(command, {
      cwd: worktree,
      shell: true,
      detached: detachProcessTree(),
      stdio: [PROCESS_STDIO.IGNORE, PROCESS_STDIO.PIPE, PROCESS_STDIO.PIPE],
      windowsHide: true,
    });
    const finish = (result: Omit<VerifyProcessResult, 'durationMs'>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, durationMs: Date.now() - startedAt });
    };
    const resetTimer = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        terminateProcessTree(child);
      }, noOutputTimeoutMs);
    };
    const recordOutput = (chunk: string): void => {
      tail = outputTail(tail, chunk);
      resetTimer();
    };
    child.stdout.setEncoding(TEXT_ENCODING.UTF8);
    child.stderr.setEncoding(TEXT_ENCODING.UTF8);
    child.stdout.on(PROCESS_EVENT.DATA, recordOutput);
    child.stderr.on(PROCESS_EVENT.DATA, recordOutput);
    resetTimer();
    child.once(PROCESS_EVENT.ERROR, () => {
      finish({ exitCode: null, signal: null, outputTail: tail.trim(), spawnFailed: true, timedOut: false });
    });
    child.once(PROCESS_EVENT.CLOSE, (exitCode, signal) => {
      finish({ exitCode, signal, outputTail: tail.trim(), spawnFailed: false, timedOut });
    });
  });
}
