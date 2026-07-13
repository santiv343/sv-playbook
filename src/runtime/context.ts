import { AsyncLocalStorage } from 'node:async_hooks';
import type { ExecutionContext } from './context.types.js';

const storage = new AsyncLocalStorage<ExecutionContext>();

export function createContext(cwd: string, sessionId: string): ExecutionContext {
  return { cwd, sessionId };
}

export function getContext(): ExecutionContext | undefined {
  return storage.getStore();
}

export function getCwd(): string {
  return getContext()?.cwd ?? process.cwd();
}

export function runWithContext<T>(ctx: ExecutionContext, fn: () => T): T {
  return storage.run(ctx, fn);
}
