import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, isDaemonRunning, setDaemonStore, setDaemonStarting, getDaemonStore } from '../db/store.js';
import { DAEMON_LOCK_FILE, DAEMON_TOKEN_FILE, DAEMON_VERSION } from './daemon.constants.js';
import { SVP_DIR } from '../db/store.constants.js';
import { runWithContext, createContext } from '../runtime/context.js';
import type { Store } from '../db/store.types.js';
import type { DaemonInstance, DaemonOptions, DaemonOutcome, HttpServerPort } from './daemon.types.js';

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

function handleExec(token: string, req: IncomingMessage, res: ServerResponse, repoRoot: string, opts: DaemonOptions): void {
  readBody(req).then((raw) => {
    const parsed = parseExecRequest(raw, token, res, repoRoot, opts);
    if (parsed === null) return;

    // Derive session from canonical workspace — client sessionId is advisory
    const store = getDaemonStore();
    if (store !== null) {
      const worktree = parsed.ctx.cwd;
      const row = store.db.prepare('SELECT id FROM sessions WHERE worktree = ?').get(worktree);
      if (row !== undefined) {
        const sid = String(Reflect.get(row, 'id'));
        // Client-claimed sessionId must match the canonical binding
        const clientSid: unknown = parsed.clientSessionId;
        if (clientSid !== undefined && clientSid !== null && String(clientSid) !== sid) {
          jsonResponse(res, 400, { error: ERR_INVALID_CONTEXT });
          return;
        }
        parsed.ctx = createContext(parsed.ctx.cwd, sid);
      } else {
        // First-use: create session binding
        const sid = randomUUID();
        store.db.prepare('INSERT INTO sessions (id, worktree, started_at) VALUES (?, ?, ?)').run(sid, worktree, new Date().toISOString());
        parsed.ctx = createContext(parsed.ctx.cwd, sid);
      }
    }

    runWithContext(parsed.ctx, () => opts.commandExecution.execute({ argv: parsed.argv, cwd: parsed.ctx.cwd })).then((result) => {
      jsonResponse(res, 200, { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, daemonVersion: DAEMON_VERSION });
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
    let terminationStarted = false;
    const lifecyclePromise = new Promise<DaemonOutcome>((resolveLifecycle) => { lifecycleComplete = (outcome) => { resolveLifecycle(outcome); }; });
    let startSettled = false;

    // Noop listener — replaced by real listener once created. Guarantees
    // terminate() always has a valid close() regardless of failure timing.
    const noopListener: HttpServerPort = { listen: () => Promise.resolve(), close: () => Promise.resolve(), onError: () => {} };
    let listener: ReturnType<typeof opts.httpServerFactory.create> = noopListener;

    const terminate = (outcome: DaemonOutcome): void => {
      if (terminationStarted) {
        if (outcome.kind === 'failed' && terminationOutcome.kind === 'stopped') terminationOutcome = outcome;
        return;
      }
      terminationStarted = true;
      terminationOutcome = outcome;
      const done = (): void => {
        daemonState = 'stopped';
        try { finalize(); } catch { /* finalize errors are secondary — causal outcome preserved */ }
        try { opts.onFinalize?.(); } catch { /* onFinalize errors are secondary */ }
        if (!startSettled) reject(outcome.kind === 'failed' ? outcome.error : new Error('daemon terminated before start'));
        lifecycleComplete?.(terminationOutcome);
      };
      void listener.close().then(done, () => { done(); /* close rejection is secondary — proceed with finalize */ });
    };

    listener = opts.httpServerFactory.create((req, res) => { routeRequest(token, req, res, repoRoot, opts, shutdown, getState); });

    const shutdown = (): Promise<DaemonOutcome> => {
      if (daemonState !== 'running') return lifecyclePromise;
      daemonState = 'stopping';
      terminate({ kind: 'stopped' });
      return lifecyclePromise;
    };

    listener.onError((err: Error) => { terminate({ kind: 'failed', error: err }); });

    void listener.listen(port, '127.0.0.1').then(() => {
      startSettled = true;
      resolve({ port, token, stop: shutdown, state: getState, done: lifecyclePromise });
    }, (err: unknown) => {
      terminate({ kind: 'failed', error: err instanceof Error ? err : new Error(String(err)) });
    });
  });
}
