import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, isDaemonRunning, setDaemonStore, setDaemonStarting } from '../db/store.js';
import { main } from '../cli/main.js';
import { DAEMON_LOCK_FILE, DAEMON_TOKEN_FILE, DAEMON_VERSION } from './daemon.constants.js';
import { EXIT } from '../cli/command.constants.js';
import { SVP_DIR } from '../db/store.constants.js';
import { runWithContext, createContext } from '../runtime/context.js';
import type { Store } from '../db/store.types.js';
import type { DaemonInstance } from './daemon.types.js';

function generateToken(): string {
  return createHash('sha256').update(randomUUID()).digest('hex').slice(0, 32);
}

// Atomically create the token file owner-only: never leave a window where the
// token exists with default (group/world-readable) permissions.
function writeTokenFileOwnerOnly(tokenPath: string, token: string): void {
  try { unlinkSync(tokenPath); } catch { /* did not exist */ }
  const fd = openSync(tokenPath, 'wx', 0o600);
  try {
    writeSync(fd, `${token}\n`);
  } finally {
    closeSync(fd);
  }
}

function writeLockFileAtomically(lockPath: string, pid: number, port: number): void {
  const fd = openSync(lockPath, 'wx', 0o600);
  try {
    writeSync(fd, `${pid}\n${port}\n${new Date().toISOString()}\n`);
  } finally {
    closeSync(fd);
  }
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

function handleRequest(token: string, req: IncomingMessage, res: ServerResponse, shutdown: () => void): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/v1/health') {
    jsonResponse(res, 200, { status: 'ok', version: DAEMON_VERSION, pid: process.pid, storeLock: 'exclusive' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/exec') {
    handleExec(token, req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/shutdown') {
    handleShutdown(token, req, res, shutdown);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}

function handleShutdown(token: string, req: IncomingMessage, res: ServerResponse, cleanup: () => void): void {
  readBody(req).then((raw) => {
    let parsedToken: unknown;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        parsedToken = Reflect.get(parsed, 'token');
      }
    } catch {
      jsonResponse(res, 400, { error: 'invalid json' });
      return;
    }
    if (parsedToken !== token) {
      jsonResponse(res, 403, { error: 'invalid token' });
      return;
    }
    jsonResponse(res, 200, { status: 'shutdown' });
    cleanup();
    setImmediate(() => process.exit(0));
  }).catch(() => {
    jsonResponse(res, 400, { error: 'request read failed' });
  });
}

function handleExec(token: string, req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((raw) => {
    let parsedToken: unknown;
    let parsedArgv: unknown;
    let parsedContext: unknown;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        parsedToken = Reflect.get(parsed, 'token');
        parsedArgv = Reflect.get(parsed, 'argv');
        parsedContext = Reflect.get(parsed, 'context');
      }
    } catch {
      jsonResponse(res, 400, { error: 'invalid json' });
      return;
    }

    if (parsedToken !== token) {
      jsonResponse(res, 403, { error: 'invalid token' });
      return;
    }

    const argv = Array.isArray(parsedArgv) ? parsedArgv.filter((a): a is string => typeof a === 'string') : [];
    if (argv.length === 0) {
      jsonResponse(res, 400, { error: 'argv required' });
      return;
    }

    const ctx = typeof parsedContext === 'object' && parsedContext !== null
      ? (() => {
          const cw = Reflect.get(parsedContext, 'cwd');
          const sid = Reflect.get(parsedContext, 'sessionId');
          return typeof cw === 'string' ? createContext(cw, typeof sid === 'string' ? sid : '') : undefined;
        })()
      : undefined;

    const execIo = buildExecIo();

    const p = ctx !== undefined ? runWithContext(ctx, () => main(argv, execIo)) : main(argv, execIo);
    p.then((exitCode) => {
      const stdout = execIo.outLines.join('\n') + (execIo.outLines.length > 0 ? '\n' : '');
      const stderr = execIo.errLines.join('\n') + (execIo.errLines.length > 0 ? '\n' : '');
      jsonResponse(res, 200, { exitCode, stdout, stderr, daemonVersion: DAEMON_VERSION });
    }).catch((err: unknown) => {
      jsonResponse(res, 200, { exitCode: EXIT.SYSTEM, stdout: '', stderr: String(err), daemonVersion: DAEMON_VERSION });
    });
  }).catch(() => {
    jsonResponse(res, 400, { error: 'request read failed' });
  });
}

function acquireLock(lockPath: string, pid: number, port: number): void {
  try {
    writeLockFileAtomically(lockPath, pid, port);
  } catch (err: unknown) {
    let msg: string;
    if (err instanceof Error && 'code' in err) {
      const c = Reflect.get(err, 'code');
      msg = c === 'EEXIST'
        ? 'daemon is already running for this repo (lock file race)'
        : `failed to create lock file: ${String(err)}`;
    } else {
      msg = `failed to create lock file: ${String(err)}`;
    }
    throw new Error(msg);
  }
}

export function startDaemon(repoRoot: string, port: number): Promise<DaemonInstance> {
  return new Promise((resolve, reject) => {
    const svpDir = join(repoRoot, SVP_DIR);
    // Owner-only: the dir holds the daemon auth token. No-op if it already exists.
    mkdirSync(svpDir, { recursive: true, mode: 0o700 });
    const lockPath = join(svpDir, DAEMON_LOCK_FILE);
    const tokenPath = join(svpDir, DAEMON_TOKEN_FILE);

    if (isDaemonRunning(repoRoot)) {
      reject(new Error('daemon is already running for this repo'));
      return;
    }

    const token = generateToken();

    // 1. Lock file FIRST — atomic single-daemon enforcement (closes TOCTOU
    //    window between isDaemonRunning check and exclusive resource access).
    try {
      acquireLock(lockPath, process.pid, port);
    } catch (err: unknown) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    // 2. Open store — we hold the lock, safe to proceed
    let store: Store;
    setDaemonStarting(true);
    try {
      store = openStore(repoRoot);
    } catch (err: unknown) {
      setDaemonStarting(false);
      try { unlinkSync(lockPath); } catch { /* best-effort */ }
      reject(new Error(`failed to open store: ${String(err)}`));
      return;
    }
    setDaemonStarting(false);
    // 3. Register shared store
    setDaemonStore(store);

    // 4. Force-acquire the exclusive lock so forwarded handlers can transact.
    //    PRAGMA locking_mode=EXCLUSIVE (applied inside openStore) sets the mode
    //    but does NOT acquire the lock — it's acquired lazily on first write.
    //    Without this, there is a window where a concurrent process could sneak
    //    in and also obtain a write lock, defeating single-writer enforcement.
    store.db.exec('BEGIN EXCLUSIVE');
    store.db.exec('COMMIT');

    writeTokenFileOwnerOnly(tokenPath, token);

    const shutdown = (): void => {
      server.close();
      setDaemonStore(null);
      store.close();
      try { unlinkSync(lockPath); } catch { /* best-effort */ }
      try { unlinkSync(tokenPath); } catch { /* best-effort */ }
    };

    const server = createServer((req, res) => { handleRequest(token, req, res, shutdown); });

    server.on('error', (err: NodeJS.ErrnoException) => {
      setDaemonStore(null);
      store.close();
      reject(err);
    });

    server.listen(port, '127.0.0.1', () => {
      resolve({ port, token, stop: shutdown });
    });
  });
}
