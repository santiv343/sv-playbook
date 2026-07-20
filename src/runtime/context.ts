import { AsyncLocalStorage } from 'node:async_hooks';
import type { ExecutionContext } from './context.types.js';

// Existe porque el daemon es un único proceso de larga vida que reenvía
// comandos originados en el cwd de OTROS procesos (ver src/cli/main.ts). Un
// simple `process.cwd()` compartiría el cwd del daemon entre todas las
// invocaciones concurrentes; AsyncLocalStorage da a cada cadena de llamadas
// async su propio `ctx` aislado sin tener que pasar `cwd` como parámetro por
// cada función intermedia.
const storage = new AsyncLocalStorage<ExecutionContext>();

export function createContext(cwd: string, sessionId: string | null = null): ExecutionContext {
  return { cwd, sessionId };
}

// `enterWith` (no `run`) porque main() necesita setear el contexto una vez
// al entrar y que persista para el resto de esa cadena async, sin envolver
// todo el resto de la función en un callback.
export function setContext(ctx: ExecutionContext): void {
  storage.enterWith(ctx);
}

export function getContext(): ExecutionContext | undefined {
  return storage.getStore();
}

// Fallback a `process.cwd()` cuando no hay contexto explícito (CLI invocado
// directo, no vía daemon) — así el resto del código nunca necesita saber si
// está corriendo dentro del daemon o no.
export function getCwd(): string {
  return getContext()?.cwd ?? process.cwd();
}

// Variante con scope explícito (`run` en vez de `enterWith`): útil para
// pruebas o invocaciones puntuales que necesitan garantizar que el contexto
// no se filtre fuera de `fn`.
export function runWithContext<T>(ctx: ExecutionContext, fn: () => T): T {
  return storage.run(ctx, fn);
}
