import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SESSION_FILE_NAME } from '../../tasks/service.constants.js';
import { ensureSession } from '../../tasks/service.js';
import { getDaemonStore } from '../../db/store.js';
import type { SessionBindingPort } from '../daemon.types.js';

function reconcileSession(store: ReturnType<typeof getDaemonStore>, worktree: string): string {
  if (store === null) throw new Error('daemon store not available for session binding');
  const file = join(worktree, SESSION_FILE_NAME);
  const fileExists = existsSync(file);
  const fileId: string | null = fileExists ? readFileSync(file, 'utf8').trim() : null;

  const dbRow = store.db.prepare('SELECT id FROM sessions WHERE worktree = ?').get(worktree);
  const dbId: string | null = dbRow !== undefined ? String(Reflect.get(dbRow, 'id')) : null;

  // Both exist: canonical DB row agrees with file
  if (fileExists && dbId !== null) {
    if (fileId !== null && fileId === dbId) return fileId;
    writeFileSync(file, `${dbId}\n`, 'utf8');
    return dbId;
  }

  // Only file exists but missing or empty: create new
  if (fileExists && (fileId === null || fileId.length === 0)) {
    return ensureSession(store, worktree);
  }

  // Only file exists with valid id but DB missing: restore DB row
  if (fileExists && fileId !== null && fileId.length > 0 && dbId === null) {
    store.db.prepare('INSERT OR IGNORE INTO sessions (id, worktree, started_at) VALUES (?, ?, ?)').run(fileId, worktree, new Date().toISOString());
    return fileId;
  }

  // Only DB exists: recreate file
  if (!fileExists && dbId !== null) {
    writeFileSync(file, `${dbId}\n`, 'utf8');
    return dbId;
  }

  // Neither exists: create new
  return ensureSession(store, worktree);
}

export function createStoreSessionBinding(): SessionBindingPort {
  return {
    resolve(request) {
      const store = getDaemonStore();
      if (store === null) throw new Error('daemon store not available for session binding');
      const { worktree, clientSessionId } = request;

      // Preflight: validate clientSessionId type before any mutation
      if (clientSessionId !== null && clientSessionId !== undefined && typeof clientSessionId !== 'string') {
        throw new Error('session requires explicit null or nonempty string');
      }
      const clientStr = typeof clientSessionId === 'string' && clientSessionId.length > 0 ? clientSessionId : null;

      const sessionFile = join(worktree, SESSION_FILE_NAME);
      const wasBound = existsSync(sessionFile);

      if (!wasBound) {
        // First-use: client must explicitly signal via null
        if (clientStr !== null) {
          throw new Error('session requires explicit null for first-use');
        }
        const boundId = reconcileSession(store, worktree);
        return { kind: 'created', sessionId: boundId };
      }

      // Binding exists: client must provide matching nonempty string
      if (clientStr === null) {
        throw new Error('session requires nonempty string claim for existing binding');
      }

      const boundId = reconcileSession(store, worktree);
      if (clientStr !== boundId) {
        throw new Error('session mismatch');
      }
      return { kind: 'bound', sessionId: boundId };
    },
  };
}
