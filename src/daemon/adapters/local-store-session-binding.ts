import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { SESSION_FILE_NAME } from '../../tasks/service.constants.js';
import { ensureSession } from '../../tasks/service.js';
import { getDaemonStore } from '../../db/store.js';
import type { SessionBindingPort } from '../daemon.types.js';

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
        const boundId = ensureSession(store, worktree);
        return { kind: 'created', sessionId: boundId };
      }

      // Binding exists: client must provide matching nonempty string
      if (clientStr === null) {
        throw new Error('session requires nonempty string claim for existing binding');
      }

      const boundId = ensureSession(store, worktree);
      if (clientStr !== boundId) {
        throw new Error('session mismatch');
      }
      return { kind: 'bound', sessionId: boundId };
    },
  };
}
