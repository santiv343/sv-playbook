import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, isDaemonRunning, setDaemonStore, setDaemonStarting, resolveStoreDir } from '../db/store.js';
import { readBuildDigest } from '../db/build-digest.js';
import { assertExclusiveStoreLock } from '../db/inspection.js';
import { DB_FILE, SVP_DIR } from '../db/store.constants.js';
import { BUILD_DIGEST_HEALTH_FIELD, DAEMON_LOCK_FILE, DAEMON_ROUTE, DAEMON_TOKEN_FILE, DAEMON_VERSION } from './daemon.constants.js';
import { HTTP_METHOD, PROCESS_EVENT, TEXT_ENCODING } from '../platform.constants.js';
import { generateToken, acquireLock, removeLock } from './daemon.lock.js';
import { runWithContext, createContext } from '../runtime/context.js';
import type { Store } from '../db/store.types.js';
import type { DaemonInstance, DaemonDeps, TerminationState } from './daemon.types.js';
import type { DaemonBackgroundWorker } from './daemon.types.js';
import { DaemonListenError } from './daemon.errors.js';
import { ERR_INVALID_CONTEXT } from './daemon.constants.js';
import { enforceWorkspaceBinding, parseExecContext } from './daemon.context.js';
import { createProductionDaemonDeps } from './daemon.production.js';
import type { CommandPort, SignalPort } from '../runtime/context.types.js';
import {
  createTerminationState,
  finalizeOnce,
  startDrain,
  trackHandler,
} from './daemon.lifecycle.js';

const ERR_INVALID_JSON = 'invalid json';
const ERR_INVALID_TOKEN = 'invalid token';
const ERR_REQ_READ_FAILED = 'request read failed';
const ERR_INTERNAL = 'internal error';
const ERR_METHOD_NOT_ALLOWED = 'method not allowed';
const ERR_SHUTTING_DOWN = 'daemon is shutting down';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on(PROCESS_EVENT.DATA, (chunk: Buffer) => { chunks.push(chunk); });
    req.on('end', () => { resolve(Buffer.concat(chunks).toString(TEXT_ENCODING.UTF8)); });
    req.on(PROCESS_EVENT.ERROR, reject);
  });
}

function jsonResponse(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res: ServerResponse): void {
  jsonResponse(res, 405, { error: ERR_METHOD_NOT_ALLOWED });
}

function handleHealth(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== HTTP_METHOD.GET) {
    methodNotAllowed(res);
    return;
  }
  jsonResponse(res, 200, {
    status: 'ok',
    version: DAEMON_VERSION,
    pid: process.pid,
    storeLock: 'exclusive',
    [BUILD_DIGEST_HEALTH_FIELD]: readBuildDigest(),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object(value) === value && !Array.isArray(value);
}

function buildExecIo(): { out: (l: string) => void; err: (l: string) => void; outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    outLines,
    errLines,
    out: (l: string) => { outLines.push(l); },
    err: (l: string) => { errLines.push(l); },
  };
}

function parseExecRequest(raw: string, token: string, res: ServerResponse): { argv: string[]; ctx: ReturnType<typeof createContext> } | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { jsonResponse(res, 400, { error: ERR_INVALID_JSON }); return null; }
  if (!isRecord(parsed)) { jsonResponse(res, 400, { error: ERR_INVALID_JSON }); return null; }

  const parsedToken: unknown = Reflect.get(parsed, 'token');
  if (parsedToken !== token) { jsonResponse(res, 403, { error: ERR_INVALID_TOKEN }); return null; }

  const parsedArgv: unknown = Reflect.get(parsed, 'argv');
  const argv = Array.isArray(parsedArgv) ? parsedArgv.filter((a): a is string => typeof a === 'string') : [];
  if (argv.length === 0) { jsonResponse(res, 400, { error: 'argv required' }); return null; }

  const ctx = parseExecContext(parsed);
  if (ctx === null) { jsonResponse(res, 400, { error: ERR_INVALID_CONTEXT }); return null; }

  return { argv, ctx };
}

function handleExecRoute(
  token: string,
  state: TerminationState,
  commandPort: CommandPort,
  req: IncomingMessage,
  res: ServerResponse,
  repoRoot: string,
): void {
  if (req.method !== HTTP_METHOD.POST) {
    methodNotAllowed(res);
    return;
  }
  handleExec(token, state, commandPort, req, res, repoRoot);
}

function handleShutdownRoute(
  token: string,
  req: IncomingMessage,
  res: ServerResponse,
  initiateShutdown: () => void,
): void {
  if (req.method !== HTTP_METHOD.POST) {
    methodNotAllowed(res);
    return;
  }
  handleShutdown(token, req, res, initiateShutdown);
}

function handleRequest(token: string, state: TerminationState, commandPort: CommandPort, req: IncomingMessage, res: ServerResponse, initiateShutdown: () => void, repoRoot: string): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === DAEMON_ROUTE.HEALTH) {
    handleHealth(req, res);
    return;
  }
  if (url.pathname === DAEMON_ROUTE.EXECUTE) {
    handleExecRoute(token, state, commandPort, req, res, repoRoot);
    return;
  }
  if (url.pathname === DAEMON_ROUTE.SHUTDOWN) {
    handleShutdownRoute(token, req, res, initiateShutdown);
    return;
  }
  jsonResponse(res, 404, { error: 'not found' });
}

function handleShutdown(token: string, req: IncomingMessage, res: ServerResponse, initiateShutdown: () => void): void {
  readBody(req).then((raw) => {
    let parsedToken: unknown;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) {
        parsedToken = Reflect.get(parsed, 'token');
      }
    } catch {
      jsonResponse(res, 400, { error: ERR_INVALID_JSON });
      return;
    }
    if (parsedToken !== token) {
      jsonResponse(res, 403, { error: ERR_INVALID_TOKEN });
      return;
    }
    jsonResponse(res, 200, { status: 'shutdown' });
    initiateShutdown();
  }).catch(() => {
    jsonResponse(res, 400, { error: ERR_REQ_READ_FAILED });
  });
}

// Ruta HTTP que ejecuta un comando del CLI DENTRO del proceso daemon,
// reutilizando su store abierto (ver commandPort en startDaemon: es
// literalmente el mismo `main()` de src/cli/main.ts). Cada request trae su
// propio ExecutionContext (cwd/sessionId de quien lo originó) y se ejecuta
// con runWithContext para que getCwd() resuelva al cwd del cliente remoto,
// no al del daemon. Si el daemon está drenando (state.stopping), rechaza
// con 503 en vez de aceptar trabajo nuevo a medias de un apagado.
function handleExec(token: string, state: TerminationState, commandPort: CommandPort, req: IncomingMessage, res: ServerResponse, repoRoot: string): void {
  if (state.stopping) {
    jsonResponse(res, 503, { error: ERR_SHUTTING_DOWN });
    return;
  }

  const p = readBody(req).then((raw) => {
    if (state.stopping) {
      jsonResponse(res, 503, { error: ERR_SHUTTING_DOWN });
      return;
    }

    const parsed = parseExecRequest(raw, token, res);
    if (parsed === null) return;

    const store = state.store;
    if (store === null) {
      jsonResponse(res, 500, { error: ERR_INTERNAL, daemonVersion: DAEMON_VERSION });
      return;
    }
    try {
      enforceWorkspaceBinding(store, repoRoot, parsed.ctx);
    } catch {
      jsonResponse(res, 400, { error: ERR_INVALID_CONTEXT });
      return;
    }

    const execIo = buildExecIo();
    // Promise.resolve().then(...) so a synchronous throw from the command port
    // is routed through the same stable-500 path as an async rejection.
    const execP = Promise.resolve().then(() => runWithContext(parsed.ctx, () => commandPort.execute(parsed.argv, execIo)));

    return execP.then((exitCode) => {
      const stdout = execIo.outLines.join('\n') + (execIo.outLines.length > 0 ? '\n' : '');
      const stderr = execIo.errLines.join('\n') + (execIo.errLines.length > 0 ? '\n' : '');
      jsonResponse(res, 200, { exitCode, stdout, stderr, daemonVersion: DAEMON_VERSION });
    }).catch(() => {
      jsonResponse(res, 500, { error: ERR_INTERNAL, daemonVersion: DAEMON_VERSION });
    });
  }).catch(() => {
    jsonResponse(res, 400, { error: ERR_REQ_READ_FAILED });
  });

  trackHandler(state, p);
}

interface DaemonRuntime {
  token: string;
  state: TerminationState;
}

interface ShutdownControl {
  initiate(): void;
  wait(): Promise<void>;
}

function openDaemonStore(repoRoot: string, lockPath: string): Store {
  setDaemonStarting(true);
  try {
    return openStore(repoRoot);
  } catch (error: unknown) {
    removeLock(lockPath);
    throw new Error(`failed to open store: ${String(error)}`);
  } finally {
    setDaemonStarting(false);
  }
}

// BEGIN EXCLUSIVE + COMMIT no hace nada útil por sí solo — es una forma de
// forzar a SQLite a tomar y liberar el lock exclusivo una vez, para que
// assertExclusiveStoreLock pueda inspeccionar el estado del archivo de lock
// del SO y confirmar que este proceso realmente tiene el lock exclusivo
// (no sólo que better-sqlite3 no tiró error). Si la verificación falla, se
// deshace todo lo que initializeDaemonRuntime ya hizo (store, lock file).
function verifyDaemonStore(store: Store, dbPath: string, lockPath: string): void {
  store.db.exec('BEGIN EXCLUSIVE');
  store.db.exec('COMMIT');
  try {
    assertExclusiveStoreLock(dbPath);
  } catch (error: unknown) {
    setDaemonStore(null);
    store.close();
    removeLock(lockPath);
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`exclusive lock verification failed: ${detail}`);
  }
}

// Orden importa: lock de PID primero (para que un segundo `daemon` falle
// rápido si ya hay uno vivo), después abrir el store (setDaemonStore lo deja
// disponible para openStore()/openStoreReadOnly() de todo el proceso, ver
// db/store.ts), recién ahí verificar el lock exclusivo real, y por último
// escribir el token nuevo (0o600, sólo el dueño del proceso puede leerlo) —
// un cliente HTTP nunca puede autenticar un exec/shutdown sin ese token.
function initializeDaemonRuntime(repoRoot: string, port: number): DaemonRuntime {
  const svpDir = join(repoRoot, SVP_DIR);
  mkdirSync(svpDir, { recursive: true, mode: 0o700 });
  const lockPath = join(svpDir, DAEMON_LOCK_FILE);
  const tokenPath = join(svpDir, DAEMON_TOKEN_FILE);
  if (isDaemonRunning(repoRoot)) throw new Error('daemon is already running for this repo');
  const token = generateToken();
  const state = createTerminationState(lockPath, tokenPath);
  acquireLock(lockPath, process.pid, port, token);
  const store = openDaemonStore(repoRoot, lockPath);
  setDaemonStore(store);
  state.store = store;
  verifyDaemonStore(store, join(resolveStoreDir(repoRoot), DB_FILE), lockPath);
  try { unlinkSync(tokenPath); } catch { /* did not exist */ }
  const tokenFd = openSync(tokenPath, 'wx', 0o600);
  try {
    writeSync(tokenFd, `${token}\n`);
  } finally {
    closeSync(tokenFd);
  }
  return { token, state };
}

function finalizeAfterDrain(state: TerminationState): void {
  void state.drainLatch.then(() => {
    finalizeOnce(state, 'shutdown requested', state.causalError ?? undefined);
  });
}

// Apagado con drenado: primero para el background worker (si lo hay), marca
// state.stopping (startDrain — así handleExec empieza a rechazar trabajo
// nuevo), y sólo cuando el server HTTP terminó de cerrar conexiones llama a
// finalizeAfterDrain. `wait()` es lo que usa `serve` para esperar a que el
// daemon realmente haya terminado antes de cerrar su propio HTTP server
// (ver serve.ts: daemon.done.then(() => stop())).
function createShutdownControl(state: TerminationState, backgroundWorker?: DaemonBackgroundWorker): ShutdownControl {
  const initiate = (): void => {
    if (state.stopping) return;
    if (backgroundWorker !== undefined) {
      const stopping = backgroundWorker.stop().catch((error: unknown) => {
        if (state.causalError === null) state.causalError = error instanceof Error ? error : new Error(String(error));
      });
      trackHandler(state, stopping);
    }
    startDrain(state);
    if (state.server === null) {
      finalizeAfterDrain(state);
      return;
    }
    state.server.close((error) => {
      if (error && state.causalError === null) state.causalError = error;
      finalizeAfterDrain(state);
    });
  };
  const wait = async (): Promise<void> => {
    initiate();
    await state.drainLatch;
  };
  return { initiate, wait };
}

function subscribeToSignals(state: TerminationState, signalPort: SignalPort, initiate: () => void): void {
  state.unsubSignal = signalPort.subscribe((signal: string) => {
    if (state.causalError === null) state.causalError = new Error(`received ${signal}`);
    initiate();
  });
}

function listenForRequests(
  port: number,
  token: string,
  state: TerminationState,
  deps: DaemonDeps,
  shutdown: ShutdownControl,
  repoRoot: string,
): Promise<DaemonInstance> {
  const store = state.store;
  if (store === null) return Promise.reject(new Error('daemon store is unavailable'));
  const server = createServer((req, res) => {
    handleRequest(token, state, deps.commandPort, req, res, () => { shutdown.initiate(); }, repoRoot);
  });
  state.server = server;
  subscribeToSignals(state, deps.signalPort, () => { shutdown.initiate(); });
  return new Promise((resolve, reject) => {
    let listening = false;
    server.on(PROCESS_EVENT.ERROR, (error: NodeJS.ErrnoException) => {
      if (state.causalError === null) state.causalError = error;
      if (!state.stopping) shutdown.initiate();
      if (!listening) {
        // Startup rejection is delivered only after termination cleanup
        // completes: wait for the terminal receipt, then reject with it.
        void state.receiptLatch.then((receipt) => {
          reject(new DaemonListenError(port, error, receipt));
        });
      }
    });
    server.listen(port, '127.0.0.1', () => {
      listening = true;
      resolve({ port, token, store, done: state.receiptLatch, stop: () => shutdown.wait().then(() => state.receiptLatch) });
    });
  });
}

export function createDaemon(repoRoot: string, port: number, deps: DaemonDeps): Promise<DaemonInstance> {
  try {
    const { token, state } = initializeDaemonRuntime(repoRoot, port);
    const backgroundWorker = state.store === null ? undefined : deps.backgroundWorkerFactory?.(state.store, repoRoot);
    backgroundWorker?.start();
    const shutdown = createShutdownControl(state, backgroundWorker);
    return listenForRequests(port, token, state, deps, shutdown, repoRoot);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error : new Error(String(error));
    return Promise.reject(reason);
  }
}

// Punto de entrada real del daemon (usado tanto por `sv-playbook daemon`
// como por `sv-playbook serve`, que lo arranca en el mismo proceso — NO hay
// spawn/fork de un proceso hijo acá). El commandPort delega en el mismo
// main() que corre un CLI directo: el daemon no reimplementa el despacho de
// comandos, sólo le da un transporte HTTP y garantiza que corre en un único
// proceso con el store ya abierto.
export async function startDaemon(repoRoot: string, port: number): Promise<DaemonInstance> {
  const { main } = await import('../cli/main.js');
  const commandPort: CommandPort = {
    execute: (argv, io) => main(argv, io),
  };
  return createDaemon(repoRoot, port, createProductionDaemonDeps(commandPort));
}
