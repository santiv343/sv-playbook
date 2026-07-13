import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, isDaemonRunning, setDaemonStore, setDaemonStarting } from '../db/store.js';
import { DAEMON_LOCK_FILE, DAEMON_TOKEN_FILE, DAEMON_VERSION } from './daemon.constants.js';
import { EXIT } from '../cli/command.constants.js';
import { SVP_DIR } from '../db/store.constants.js';
import { runWithContext, createContext } from '../runtime/context.js';
import type { Store } from '../db/store.types.js';
import type { DaemonExecIo, DaemonInstance, DaemonOptions, DaemonOutcome } from './daemon.types.js';

const ERR_INVALID_JSON = 'invalid json';
const ERR_INVALID_TOKEN = 'invalid token';
const ERR_REQ_READ_FAILED = 'request read failed';
const ERR_INVALID_CONTEXT = 'invalid context (missing or outside repo)';
const ERR_INVALID_ARGV = 'argv required';
const ERR_UNAVAILABLE = 'service unavailable (daemon is stopping)';

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

function buildExecIo(): DaemonExecIo {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    outLines, errLines,
    out: (l: string) => { outLines.push(l); },
    err: (l: string) => { errLines.push(l); },
  };
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

function parseExecRequest(raw: string, token: string, res: ServerResponse, repoRoot: string, opts: DaemonOptions): { argv: string[]; ctx: ReturnType<typeof createContext> } | null {
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

  return { argv, ctx };
}

function handleExec(token: string, req: IncomingMessage, res: ServerResponse, repoRoot: string, opts: DaemonOptions): void {
  readBody(req).then((raw) => {
    const parsed = parseExecRequest(raw, token, res, repoRoot, opts);
    if (parsed === null) return;

    const execIo = buildExecIo();
    runWithContext(parsed.ctx, () => opts.executeCommand(parsed.argv, execIo)).then((exitCode) => {
      const stdout = execIo.outLines.join('\n') + (execIo.outLines.length > 0 ? '\n' : '');
      const stderr = execIo.errLines.join('\n') + (execIo.errLines.length > 0 ? '\n' : '');
      jsonResponse(res, 200, { exitCode, stdout, stderr, daemonVersion: DAEMON_VERSION });
    }).catch((err: unknown) => {
      jsonResponse(res, 200, { exitCode: EXIT.SYSTEM, stdout: '', stderr: String(err), daemonVersion: DAEMON_VERSION });
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
    cleanup().then(() => process.exit(0)).catch(() => process.exit(1));
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

function routeRequest(token: string, req: IncomingMessage, res: ServerResponse, repoRoot: string, opts: DaemonOptions, shutdown: () => Promise<DaemonOutcome>, daemonState: () => 'running' | 'stopping' | 'stopped'): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/v1/health') {
    jsonResponse(res, 200, { status: daemonState() === 'running' ? 'ok' : 'stopping', version: DAEMON_VERSION, pid: process.pid, storeLock: 'exclusive' });
    return;
  }
  if (daemonState() !== 'running') { jsonResponse(res, 503, { error: ERR_UNAVAILABLE }); return; }
  if (req.method !== 'POST') { notFound(res); return; }
  if (url.pathname === '/api/v1/exec') { handleExec(token, req, res, repoRoot, opts); return; }
  if (url.pathname === '/api/v1/shutdown') { handleShutdown(token, req, res, shutdown); return; }
  notFound(res);
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'not found' }));
}

export function startDaemon(repoRoot: string, port: number, opts: DaemonOptions): Promise<DaemonInstance> {
  return new Promise((resolve, reject) => {
    const svpDir = join(repoRoot, SVP_DIR);
    mkdirSync(svpDir, { recursive: true, mode: 0o700 });
    const lockPath = join(svpDir, DAEMON_LOCK_FILE);
    const tokenPath = join(svpDir, DAEMON_TOKEN_FILE);

    if (isDaemonRunning(repoRoot)) { reject(new Error('daemon is already running for this repo')); return; }

    const token = generateToken();
    try { acquireLock(lockPath, process.pid, port); } catch (err: unknown) { reject(err instanceof Error ? err : new Error(String(err))); return; }

    let store: Store;
    setDaemonStarting(true);
    try { store = openStore(repoRoot); } catch (err: unknown) {
      setDaemonStarting(false); try { unlinkSync(lockPath); } catch { /* best-effort */ }
      reject(new Error(`failed to open store: ${String(err)}`));
      return;
    }
    setDaemonStarting(false);
    setDaemonStore(store);

    const finalize = (): void => { setDaemonStore(null); store.close(); try { unlinkSync(lockPath); } catch { } try { unlinkSync(tokenPath); } catch { } };

    try {
      store.db.exec('BEGIN EXCLUSIVE'); store.db.exec('COMMIT');
      writeTokenFileOwnerOnly(tokenPath, token);
    } catch (err: unknown) { finalize(); reject(new Error(`startup failed: ${String(err)}`)); return; }

    let daemonState: 'running' | 'stopping' | 'stopped' = 'running';
    const getState = (): 'running' | 'stopping' | 'stopped' => daemonState;
    let lifecycleComplete: ((outcome: DaemonOutcome) => void) | null = null;
    let terminationOutcome: DaemonOutcome = { kind: 'stopped' };
    const lifecyclePromise = new Promise<DaemonOutcome>((resolveLifecycle) => { lifecycleComplete = (outcome) => { resolveLifecycle(outcome); }; });
    let startSettled = false;

    const finalizeOnce = (outcome?: DaemonOutcome): void => {
      if (daemonState === 'stopped') return;
      if (outcome) terminationOutcome = outcome;
      daemonState = 'stopped';
      finalize();
      opts.onFinalize?.();
      lifecycleComplete?.(terminationOutcome);
    };

    const shutdown = (): Promise<DaemonOutcome> => {
      if (daemonState !== 'running') return lifecyclePromise;
      daemonState = 'stopping';
      server.close(() => { finalizeOnce({ kind: 'stopped' }); });
      return lifecyclePromise;
    };

    const server = createServer((req, res) => { routeRequest(token, req, res, repoRoot, opts, shutdown, getState); });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (!startSettled) { finalizeOnce({ kind: 'failed', error: err }); reject(err); return; }
      finalizeOnce({ kind: 'failed', error: err });
    });

    server.listen(port, '127.0.0.1', () => { startSettled = true; resolve({
      port, token, stop: shutdown, state: getState,
      done: lifecyclePromise,
    }); });
  });
}
