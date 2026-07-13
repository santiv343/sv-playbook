import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, isDaemonRunning, setDaemonStore, setDaemonStarting } from '../db/store.js';
import { DAEMON_LOCK_FILE, DAEMON_TOKEN_FILE, DAEMON_VERSION } from './daemon.constants.js';
import { SVP_DIR } from '../db/store.constants.js';
import { runWithContext, createContext } from '../runtime/context.js';
import type { Store } from '../db/store.types.js';
import type { DaemonInstance, DaemonOptions, DaemonOutcome, HttpServerPort, SessionBindingPort } from './daemon.types.js';

const ERR_INVALID_JSON = 'invalid json';
const ERR_INVALID_TOKEN = 'invalid token';
const ERR_REQ_READ_FAILED = 'request read failed';
const ERR_INVALID_CONTEXT = 'invalid context (missing or outside repo)';
const ERR_INVALID_ARGV = 'argv required';
const ERR_UNAVAILABLE = 'service unavailable (daemon is stopping)';
const ERR_EXEC_REJECTED = 'command execution rejected';

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((a) => typeof a === 'string');
}

function generateToken(): string {
  return createHash('sha256').update(randomUUID()).digest('hex').slice(0, 32);
}

function writeTokenFileOwnerOnly(tokenPath: string, token: string): void {
  try { unlinkSync(tokenPath); } catch { /* did not exist */ }
  const fd = openSync(tokenPath, 'wx', 0o600);
  try { writeSync(fd, `${token}\n`); } finally { closeSync(fd); }
}

function writeLockFileAtomically(lockPath: string, pid: number, port: number): void {
  const fd = openSync(lockPath, 'wx', 0o600);
  try { writeSync(fd, `${pid}\n${port}\n${new Date().toISOString()}\n`); } finally { closeSync(fd); }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => { chunks.push(chunk); });
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function jsonResponse(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function contextFromPayload(parsed: object, repoRoot: string, ws: import('../runtime/workspace.types.js').WorkspacePort): ReturnType<typeof createContext> | null {
  const rawCtx: unknown = Reflect.get(parsed, 'context');
  if (typeof rawCtx !== 'object' || rawCtx === null) return null;
  const cwVal: unknown = Reflect.get(rawCtx, 'cwd');
  if (typeof cwVal !== 'string' || cwVal.length === 0) return null;
  const canonical = ws.canonicalWorkspaceRoot(cwVal);
  if (canonical === null) return null;
  if (!ws.sameWorkspace(canonical, repoRoot)) return null;
  return createContext(canonical);
}

function parseExecRequest(raw: string, token: string, res: ServerResponse, repoRoot: string, opts: DaemonOptions): { argv: string[]; ctx: ReturnType<typeof createContext>; clientSessionId: unknown } | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { jsonResponse(res, 400, { error: ERR_INVALID_JSON }); return null; }
  if (typeof parsed !== 'object' || parsed === null) { jsonResponse(res, 400, { error: ERR_INVALID_JSON }); return null; }

  const parsedToken: unknown = Reflect.get(parsed, 'token');
  if (parsedToken !== token) { jsonResponse(res, 403, { error: ERR_INVALID_TOKEN }); return null; }

  const parsedArgv: unknown = Reflect.get(parsed, 'argv');
  if (!isStringArray(parsedArgv)) { jsonResponse(res, 400, { error: ERR_INVALID_ARGV }); return null; }
  const argv: string[] = parsedArgv;

  const ctx = contextFromPayload(parsed, repoRoot, opts.workspaceIdentity);
  if (ctx === null) { jsonResponse(res, 400, { error: ERR_INVALID_CONTEXT }); return null; }

  const rawCtx: unknown = Reflect.get(parsed, 'context');
  const clientSessionId: unknown = typeof rawCtx === 'object' && rawCtx !== null ? Reflect.get(rawCtx, 'sessionId') : undefined;

  return { argv, ctx, clientSessionId };
}

function handleExec(token: string, req: IncomingMessage, res: ServerResponse, repoRoot: string, opts: DaemonOptions, binding: SessionBindingPort): void {
  readBody(req).then((raw) => {
    const parsed = parseExecRequest(raw, token, res, repoRoot, opts);
    if (parsed === null) return;

    // Resolve session binding via injected port (storage-agnostic)
    let sid: string | null = null;
    try {
      const result = binding.resolve({ worktree: parsed.ctx.cwd, clientSessionId: parsed.clientSessionId });
      sid = result.sessionId;
    } catch {
      jsonResponse(res, 400, { error: ERR_INVALID_CONTEXT });
      return;
    }
    const enrichedCtx = createContext(parsed.ctx.cwd, sid);

    Promise.resolve().then(() => runWithContext(enrichedCtx, () => opts.commandExecution.execute({ argv: parsed.argv, cwd: parsed.ctx.cwd }))).then((result) => {
      jsonResponse(res, 200, { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, daemonVersion: DAEMON_VERSION, sessionId: sid });
    }).catch(() => {
      jsonResponse(res, 500, { error: ERR_EXEC_REJECTED });
    });
  }).catch(() => {
    jsonResponse(res, 400, { error: ERR_REQ_READ_FAILED });
  });
}

function handleShutdown(token: string, req: IncomingMessage, res: ServerResponse, cleanup: () => Promise<DaemonOutcome>): void {
  readBody(req).then((raw) => {
    let parsedToken: unknown;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        parsedToken = Reflect.get(parsed, 'token');
      }
    } catch { jsonResponse(res, 400, { error: ERR_INVALID_JSON }); return; }
    if (parsedToken !== token) { jsonResponse(res, 403, { error: ERR_INVALID_TOKEN }); return; }
    jsonResponse(res, 200, { status: 'shutdown' });
    void cleanup();
  }).catch(() => { jsonResponse(res, 400, { error: ERR_REQ_READ_FAILED }); });
}

function acquireLock(lockPath: string, pid: number, port: number): void {
  try { writeLockFileAtomically(lockPath, pid, port); } catch (err: unknown) {
    let msg: string;
    if (err instanceof Error && 'code' in err) {
      const c = Reflect.get(err, 'code');
      msg = c === 'EEXIST' ? 'daemon is already running for this repo (lock file race)' : `failed to create lock file: ${String(err)}`;
    } else {
      msg = `failed to create lock file: ${String(err)}`;
    }
    throw new Error(msg);
  }
}

function routeRequest(token: string, req: IncomingMessage, res: ServerResponse, repoRoot: string, opts: DaemonOptions, shutdown: () => Promise<DaemonOutcome>, daemonState: () => 'running' | 'stopping' | 'stopped', binding: SessionBindingPort): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/v1/health') {
    jsonResponse(res, 200, { status: daemonState() === 'running' ? 'ok' : 'stopping', version: DAEMON_VERSION, pid: process.pid, storeLock: 'exclusive' });
    return;
  }
  if (daemonState() !== 'running') { jsonResponse(res, 503, { error: ERR_UNAVAILABLE }); return; }
  if (req.method !== 'POST') { notFound(res); return; }
  if (url.pathname === '/api/v1/exec') { handleExec(token, req, res, repoRoot, opts, binding); return; }
  if (url.pathname === '/api/v1/shutdown') { handleShutdown(token, req, res, shutdown); return; }
  notFound(res);
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'not found' }));
}

export function startDaemon(repoRoot: string, port: number, opts: DaemonOptions): Promise<DaemonInstance> {
  return new Promise((resolve, reject) => { startDaemonInner(resolve, reject, repoRoot, port, opts); });
}

function createTerminate(
  context: {
    state: { terminationStarted: boolean; terminationOutcome: DaemonOutcome };
    listenerRef: { current: HttpServerPort };
    evidence: string[];
    startSettled: { value: boolean };
    daemonState: { value: 'running' | 'stopping' | 'stopped' };
    lifecycleComplete: ((outcome: DaemonOutcome) => void) | null;
    reject: (reason: unknown) => void;
    resolve: (value: DaemonInstance | PromiseLike<DaemonInstance>) => void;
    finalize: () => void;
    onFinalize: (() => void) | undefined;
  },
): (outcome: DaemonOutcome) => void {
  return (outcome: DaemonOutcome): void => {
    const s = context.state;
    if (s.terminationStarted) {
      if (outcome.kind === 'failed' && s.terminationOutcome.kind === 'stopped') s.terminationOutcome = outcome;
      return;
    }
    s.terminationStarted = true;
    s.terminationOutcome = outcome;
    const done = (): void => {
      context.daemonState.value = 'stopped';
      context.finalize();
      try { context.onFinalize?.(); } catch (e: unknown) { context.evidence.push(`onFinalize:${e instanceof Error ? e.message : String(e)}`); }
      if (s.terminationOutcome.kind === 'stopped' && context.evidence.length > 0) {
        s.terminationOutcome = { kind: 'failed', error: new Error(`cleanup errors: ${context.evidence.join('; ')}`) };
      }
      if (!context.startSettled.value) context.reject(s.terminationOutcome.kind === 'failed' ? s.terminationOutcome.error : Error('daemon terminated before start'));
      context.lifecycleComplete?.(s.terminationOutcome);
    };
    void context.listenerRef.current.close().then(done, (err: unknown) => {
      context.evidence.push(`close:${err instanceof Error ? err.message : String(err)}`);
      done();
    });
  };
}

interface DaemonContext {
  resolve: (value: DaemonInstance | PromiseLike<DaemonInstance>) => void;
  reject: (reason: unknown) => void;
  repoRoot: string;
  port: number;
  opts: DaemonOptions;
  lockPath: string;
  tokenPath: string;
  evidence: string[];
}

function setupDaemon(ctx: DaemonContext): { token: string; sessionBinding: SessionBindingPort; finalize: () => void; store: Store } | null {
  if (isDaemonRunning(ctx.repoRoot)) { ctx.reject(new Error('daemon is already running for this repo')); return null; }
  const token = generateToken();
  try { acquireLock(ctx.lockPath, process.pid, ctx.port); } catch (err: unknown) { ctx.reject(err instanceof Error ? err : new Error(String(err))); return null; }
  setDaemonStarting(true);
  let store: Store;
  try { store = openStore(ctx.repoRoot); } catch (err: unknown) {
    setDaemonStarting(false); try { unlinkSync(ctx.lockPath); } catch { /* best-effort */ }
    ctx.reject(new Error(`failed to open store: ${String(err)}`)); return null;
  }
  setDaemonStarting(false);
  setDaemonStore(store);
  const evidence: string[] = [];
  const finalize = (): void => {
    setDaemonStore(null);
    try { store.close(); } catch (e: unknown) { evidence.push(`store:${e instanceof Error ? e.message : String(e)}`); }
    try { unlinkSync(ctx.lockPath); } catch (e: unknown) { evidence.push(`lock:${e instanceof Error ? e.message : String(e)}`); }
    try { unlinkSync(ctx.tokenPath); } catch (e: unknown) { evidence.push(`token:${e instanceof Error ? e.message : String(e)}`); }
  };
  try { store.db.exec('BEGIN EXCLUSIVE'); store.db.exec('COMMIT'); writeTokenFileOwnerOnly(ctx.tokenPath, token); }
  catch (err: unknown) { finalize(); ctx.reject(new Error(`startup failed: ${String(err)}`)); return null; }
  ctx.evidence = evidence;
  return { token, sessionBinding: ctx.opts.sessionBinding, finalize, store };
}

function startDaemonInner(
  resolve: (value: DaemonInstance | PromiseLike<DaemonInstance>) => void,
  reject: (reason: unknown) => void,
  repoRoot: string, port: number, opts: DaemonOptions,
): void {
  const svpDir = join(repoRoot, SVP_DIR);
  mkdirSync(svpDir, { recursive: true, mode: 0o700 });
  const lockPath = join(svpDir, DAEMON_LOCK_FILE);
  const tokenPath = join(svpDir, DAEMON_TOKEN_FILE);

  const daemonCtx: DaemonContext = { resolve, reject, repoRoot, port, opts, lockPath, tokenPath, evidence: [] };
  const setup = setupDaemon(daemonCtx);
  if (setup === null) return;

  const termState: { terminationStarted: boolean; terminationOutcome: DaemonOutcome } = { terminationStarted: false, terminationOutcome: { kind: 'stopped' } };
  const daemonState: { value: 'running' | 'stopping' | 'stopped' } = { value: 'running' };
  const getState = (): 'running' | 'stopping' | 'stopped' => daemonState.value;
  let lifecycleComplete: ((outcome: DaemonOutcome) => void) | null = null;
  const lifecyclePromise = new Promise<DaemonOutcome>((rl) => { lifecycleComplete = (o) => { rl(o); }; });
  const startSettled: { value: boolean } = { value: false };

  const noopListener: HttpServerPort = { listen: () => Promise.resolve(), close: () => Promise.resolve(), onError: () => {} };
  const listenerRef: { current: HttpServerPort } = { current: noopListener };

  const termCtx = {
    state: termState, listenerRef, evidence: daemonCtx.evidence,
    startSettled, daemonState, lifecycleComplete, reject, resolve,
    finalize: setup.finalize, onFinalize: opts.onFinalize,
  };
  const terminate = createTerminate(termCtx);

  listenerRef.current = opts.httpServerFactory.create((req, r) => { routeRequest(setup.token, req, r, repoRoot, opts, shutdown, getState, setup.sessionBinding); });
  const shutdown = (): Promise<DaemonOutcome> => {
    if (daemonState.value !== 'running') return lifecyclePromise;
    daemonState.value = 'stopping';
    terminate({ kind: 'stopped' });
    return lifecyclePromise;
  };

  listenerRef.current.onError((err: Error) => { terminate({ kind: 'failed', error: err }); });
  void listenerRef.current.listen(port, '127.0.0.1').then(() => {
    if (termState.terminationStarted) return;
    startSettled.value = true;
    resolve({ port, token: setup.token, stop: shutdown, state: getState, done: lifecyclePromise });
  }, (err: unknown) => {
    terminate({ kind: 'failed', error: err instanceof Error ? err : new Error(String(err)) });
  });
}
