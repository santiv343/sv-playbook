import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { SESSION_FILE_NAME } from '../../tasks/service.constants.js';
import { ensureSession } from '../../tasks/service.js';
import { getDaemonStore } from '../../db/store.js';
import type { SessionBindingPort } from '../daemon.types.js';

const ERR_NO_STORE = 'daemon store not available for session binding';

function reconcileBoth(file: string, fileId: string, dbId: string): string {
  if (fileId === dbId) return fileId;
  writeFileSync(file, `${dbId}\n`, 'utf8');
  return dbId;
}

function reconcileSession(store: ReturnType<typeof getDaemonStore>, worktree: string): string {
  if (store === null) throw new Error(ERR_NO_STORE);
  const file = join(worktree, SESSION_FILE_NAME);
  const fileExists = existsSync(file);
  const fileId: string | null = fileExists ? readFileSync(file, 'utf8').trim() : null;
  const dbRow = store.db.prepare('SELECT id FROM sessions WHERE worktree = ?').get(worktree);
  const dbId: string | null = dbRow !== undefined ? String(Reflect.get(dbRow, 'id')) : null;
  const hasFileId = fileId !== null && fileId.length > 0;
  const hasDbId = dbId !== null;

  if (fileExists) {
    if (hasDbId) return reconcileBoth(file, fileId ?? '', dbId);
    if (hasFileId) {
      store.db.prepare('INSERT OR IGNORE INTO sessions (id, worktree, started_at) VALUES (?, ?, ?)').run(fileId, worktree, new Date().toISOString());
      return fileId;
    }
    return ensureSession(store, worktree);
  }
  if (hasDbId) { writeFileSync(file, `${dbId}\n`, 'utf8'); return dbId; }
  return ensureSession(store, worktree);
}

function preflightClientId(clientSessionId: unknown): string | null {
  if (clientSessionId !== null && clientSessionId !== undefined && typeof clientSessionId !== 'string') {
    throw new Error('session requires explicit null or nonempty string');
  }
  return typeof clientSessionId === 'string' && clientSessionId.length > 0 ? clientSessionId : null;
}

export function createStoreSessionBinding(): SessionBindingPort {
  return {
    resolve(request) {
      const store = getDaemonStore();
      if (store === null) throw new Error(ERR_NO_STORE);
      const { worktree, clientSessionId } = request;
      const clientStr = preflightClientId(clientSessionId);
      const sessionFile = join(worktree, SESSION_FILE_NAME);
      const wasBound = existsSync(sessionFile);

      if (!wasBound) {
        if (clientStr !== null) throw new Error('session requires explicit null for first-use');
        return { kind: 'created', sessionId: reconcileSession(store, worktree) };
      }

      if (clientStr === null) throw new Error('session requires nonempty string claim for existing binding');
      const boundId = reconcileSession(store, worktree);
      if (clientStr !== boundId) throw new Error('session mismatch');
      return { kind: 'bound', sessionId: boundId };
    },
  };
}
