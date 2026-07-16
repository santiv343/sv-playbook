import { readFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { get as httpGet, request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DAEMON_ROUTE, DAEMON_TOKEN_FILE } from '../daemon/daemon.constants.js';
import { SVP_DIR } from '../db/store.constants.js';
import { HTTP_METHOD, HTTP_STATUS, OS_PLATFORM, PROCESS_EVENT, TEXT_ENCODING, WINDOWS_PROCESS_TREE_ARGUMENT, WINDOWS_PROCESS_TREE_COMMAND } from '../platform.constants.js';
import { initTestRepo } from '../testkit.js';
import type { CollectedProcess, JsonResponse } from './daemon-test-utils.types.js';

const HTTP_HOST = '127.0.0.1';
const CONTENT_TYPE_HEADER = 'Content-Type';
const CONTENT_LENGTH_HEADER = 'Content-Length';
const JSON_BODY_TYPE = 'application/json';
const ERR_CONN_REFUSED = 'ECONNREFUSED';
const CONN_REFUSED_TEXT = 'connection refused';
const EXIT_POLL_MS = 5000;
const HEALTH_ATTEMPTS = 30;
const HEALTH_DELAY_MS = 500;

export function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.listen(0, () => {
      const address = server.address();
      let port = 0;
      if (typeof address === 'object' && address !== null && 'port' in address) port = address.port;
      server.close(() => { resolve(port); });
    });
  });
}

export function initFixtureRepo(root: string): void {
  initTestRepo(root);
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
}

export function postJson(port: number, path: string, body: unknown, timeoutMs = EXIT_POLL_MS): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = httpRequest({
      hostname: HTTP_HOST, port, method: HTTP_METHOD.POST, path,
      headers: { [CONTENT_TYPE_HEADER]: JSON_BODY_TYPE, [CONTENT_LENGTH_HEADER]: Buffer.byteLength(data) },
    }, (res) => {
      let received = '';
      res.setEncoding(TEXT_ENCODING.UTF8);
      res.on(PROCESS_EVENT.DATA, (chunk: string) => { received += chunk; });
      res.on('end', () => { resolve({ statusCode: res.statusCode, body: received }); });
    });
    req.on(PROCESS_EVENT.ERROR, reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.end(data);
  });
}

export function realCliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.SV_PLAYBOOK_DAEMON;
  return env;
}

export function spawnCollect(execPath: string, binPath: string, args: string[], cwd: string): Promise<CollectedProcess> {
  return new Promise((resolve) => {
    const child = spawn(execPath, [binPath, ...args], { cwd, env: realCliEnv(), timeout: 15000 });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding(TEXT_ENCODING.UTF8);
    child.stderr.setEncoding(TEXT_ENCODING.UTF8);
    child.stdout.on(PROCESS_EVENT.DATA, (d: string) => { stdout += d; });
    child.stderr.on(PROCESS_EVENT.DATA, (d: string) => { stderr += d; });
    child.on(PROCESS_EVENT.EXIT, (status) => { resolve({ status, stdout, stderr }); });
  });
}

export function isConnectionRefused(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(ERR_CONN_REFUSED) || message.includes(CONN_REFUSED_TEXT);
}

function forceKillProcess(pid: number): void {
  if (process.platform === OS_PLATFORM.WINDOWS) {
    spawnSync(WINDOWS_PROCESS_TREE_COMMAND, [WINDOWS_PROCESS_TREE_ARGUMENT.FORCE, WINDOWS_PROCESS_TREE_ARGUMENT.TREE, WINDOWS_PROCESS_TREE_ARGUMENT.PID, String(pid)]);
    return;
  }
  try { process.kill(pid, 0); } catch { return; }
  try { process.kill(pid, 'SIGKILL'); } catch { /* process may have already exited */ }
}

export async function stopDaemonChild(child: ChildProcess, root: string, port: number): Promise<void> {
  if (child.exitCode !== null) return;
  try {
    const token = (await readFile(join(root, SVP_DIR, DAEMON_TOKEN_FILE), TEXT_ENCODING.UTF8)).trim().split('\n')[0] ?? '';
    if (token) await postJson(port, DAEMON_ROUTE.SHUTDOWN, { token });
  } catch { /* best-effort */ }
  const waitExit = (): Promise<void> => new Promise((resolve) => {
    child.once(PROCESS_EVENT.EXIT, () => { resolve(); });
    setTimeout(() => { resolve(); }, EXIT_POLL_MS).unref();
  });
  const alive = (): boolean => child.exitCode === null;
  if (alive()) await waitExit();
  const pid = child.pid;
  if (pid !== undefined && alive()) { forceKillProcess(pid); await waitExit(); }
}

export async function pollDaemon(port: number): Promise<void> {
  for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt++) {
    const statusCode = await new Promise<number | undefined>((resolve) => {
      const req = httpGet(`http://${HTTP_HOST}:${port}${DAEMON_ROUTE.HEALTH}`, (res) => { resolve(res.statusCode); });
      req.on(PROCESS_EVENT.ERROR, () => { resolve(undefined); });
      req.setTimeout(2000, () => { req.destroy(); resolve(undefined); });
    });
    if (statusCode === HTTP_STATUS.OK) return;
    await new Promise((resolve) => { setTimeout(resolve, HEALTH_DELAY_MS); });
  }
  throw new Error('daemon did not start');
}

export async function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(message)); }, ms);
    promise.then(
      (value: T) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}

let daemonIndex = 0;
export function nextIndex(): number {
  daemonIndex += 1;
  return daemonIndex;
}

export function tempRoot(prefix: string): string {
  return join(tmpdir(), `${prefix}-${nextIndex()}`);
}

export function prop(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}
