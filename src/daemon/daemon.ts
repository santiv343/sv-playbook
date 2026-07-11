import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { openStore, isDaemonRunning } from '../db/store.js';
import { main } from '../cli/main.js';
import { DAEMON_LOCK_FILE, DAEMON_TOKEN_FILE, DAEMON_VERSION } from './daemon.constants.js';
import { EXIT } from '../cli/command.constants.js';
import { SVP_DIR } from '../db/store.constants.js';
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

function handleRequest(token: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/v1/health') {
    jsonResponse(res, 200, { status: 'ok', version: DAEMON_VERSION, pid: process.pid, storeLock: 'exclusive' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/exec') {
    handleExec(token, req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}

function handleExec(token: string, req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((raw) => {
    let parsedToken: unknown;
    let parsedArgv: unknown;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        parsedToken = Reflect.get(parsed, 'token');
        parsedArgv = Reflect.get(parsed, 'argv');
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

    const execIo = buildExecIo();

    main(argv, execIo).then((exitCode) => {
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

    let store: Store;
    try {
      store = openStore(repoRoot);
      store.db.exec('PRAGMA locking_mode = EXCLUSIVE');
      store.db.exec('BEGIN EXCLUSIVE');
    } catch (err: unknown) {
      reject(new Error(`failed to open store in exclusive mode: ${String(err)}`));
      return;
    }

    writeFileSync(lockPath, `${process.pid}\n${port}\n${new Date().toISOString()}\n`);
    writeTokenFileOwnerOnly(tokenPath, token);

    const server = createServer((req, res) => { handleRequest(token, req, res); });

    server.on('error', (err: NodeJS.ErrnoException) => {
      store.db.exec('ROLLBACK');
      store.close();
      reject(err);
    });

    server.listen(port, '127.0.0.1', () => {
      store.db.exec('ROLLBACK');
      resolve({
        port,
        token,
        stop: () => {
          server.close();
          store.db.exec('PRAGMA locking_mode = NORMAL');
          store.close();
          try { unlinkSync(lockPath); } catch { /* best-effort */ }
          try { unlinkSync(tokenPath); } catch { /* best-effort */ }
        },
      });
    });
  });
}
