import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CONFIRM_DESTRUCTIVE_FLAG, DESTRUCTIVE_LOG_FILE, DONE_COUNT_SQL, EVENT_COUNT_SQL, EXIT, SESSION_ROLE_FILE } from './command.constants.js';
import { DB_FILE, SQLITE_FILE_HEADER } from '../db/store.constants.js';
import { resolveStoreDir, openStore } from '../db/store.js';
import type { DestructiveCounts, Io } from './command.types.js';

// Un agente autenticado como un rol de sesión (ver SESSION_ROLE_FILE) nunca
// puede ejecutar un comando destructivo directamente, sin importar si trae
// --confirm-destructive: ver checkDestructiveGate más abajo. Ese archivo es
// la única señal de "esto lo está corriendo un agente, no un humano
// interactivo frente a la terminal".
export function readSessionRole(repoRoot: string): string | null {
  const f = join(repoRoot, SESSION_ROLE_FILE);
  if (!existsSync(f)) return null;
  const role = readFileSync(f, 'utf8').trim().split('\n')[0];
  return role !== undefined && role !== '' ? role : null;
}

function fileIsSQLite(path: string): boolean {
  if (!existsSync(path)) return false;
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    return readSync(fd, buf, 0, 16, 0) === 16 && buf.toString('utf8', 0, 16) === SQLITE_FILE_HEADER;
  } finally {
    closeSync(fd);
  }
}

// Cuenta cuánto estado real está en riesgo (packets done, eventos) para
// mostrárselo al humano ANTES de que confirme — el gate no sólo bloquea,
// también informa la magnitud de lo que se perdería. Si el store todavía no
// existe o no es un archivo SQLite válido (proyecto recién inicializado),
// no hay nada que perder: cuenta 0 en vez de fallar.
export function queryDestructiveCounts(repoRoot: string): DestructiveCounts {
  const dbPath = join(resolveStoreDir(repoRoot), DB_FILE);
  if (!fileIsSQLite(dbPath)) return { done: 0, events: 0 };
  try {
    const store = openStore(repoRoot);
    try {
      const done = store.db.prepare(DONE_COUNT_SQL).get();
      const events = store.db.prepare(EVENT_COUNT_SQL).get();
      const cntA = countValue(done);
      const cntB = countValue(events);
      return { done: cntA, events: cntB };
    } finally {
      store.close();
    }
  } catch {
    return { done: 0, events: 0 };
  }
}

function countValue(row: unknown): number {
  return row !== undefined && row !== null && typeof row === 'object' && 'cnt' in row ? Number(row.cnt) : 0;
}

// Best-effort a propósito: si falla escribir el log de auditoría (disco
// lleno, permisos), el gate en sí no debe romperse por eso — la decisión de
// bloquear/permitir no puede depender de un side-effect de logging.
function recordDestructiveEvent(repoRoot: string, detail: string): void {
  try {
    const file = join(repoRoot, DESTRUCTIVE_LOG_FILE);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${new Date().toISOString()} ${detail}\n`, 'utf8');
  } catch {
    /* best-effort */
  }
}

// Dos rechazos posibles, en orden de prioridad: (1) es un agente — rechazo
// categórico, ni --confirm-destructive lo destraba, porque la decisión de
// borrar estado real le corresponde a un humano (ver readSessionRole); (2)
// es un humano pero no confirmó — se le muestra el impacto (counts) y se
// pide repetir el comando con el flag. Cada rama deja rastro en el log de
// auditoría, se apruebe o se rechace.
export function checkDestructiveGate(
  io: Io,
  commandLabel: string,
  repoRoot: string,
  hasConfirmFlag: boolean,
  counts: DestructiveCounts,
): number | undefined {
  const role = readSessionRole(repoRoot);

  if (role !== null) {
    io.err(`destructive action — agent sessions cannot execute it: record the request with \`decision ask ${commandLabel}\` and wait for human execution`);
    recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} refused — role=${role}`);
    return EXIT.GATE_FAIL;
  }

  if (!hasConfirmFlag) {
    io.err(`destructive action: ${counts.done} done packet(s), ${counts.events} event(s) would be affected`);
    io.err(`pass ${CONFIRM_DESTRUCTIVE_FLAG} to proceed`);
    recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} refused — missing confirm`);
    return EXIT.GATE_FAIL;
  }

  recordDestructiveEvent(repoRoot, `destructive-gate: ${commandLabel} approved — actor=unbound-human, ${counts.done} done, ${counts.events} events`);
  return undefined;
}
