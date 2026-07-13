import { readFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { get as httpGet, request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import type { WorkspacePort } from '../runtime/workspace.types.js';

export function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer(); s.listen(0, () => { const a = s.address(); s.close(() => { resolve(typeof a === 'object' && a !== null && 'port' in a ? a.port : 0); }); });
  });
}

export function initFixtureRepo(root: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
}

export function postJson(port: number, path: string, body: unknown, timeoutMs = 5000): Promise<{ statusCode: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = httpRequest({
      hostname: '127.0.0.1', port, method: 'POST', path,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', (c: string) => { d += c; }); res.on('end', () => { resolve({ statusCode: res.statusCode, body: d }); });
    });
    req.on('error', reject); req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); }); req.end(data);
  });
}

export function realCliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.SV_PLAYBOOK_DAEMON; return env;
}

export function spawnCollect(execPath: string, binPath: string, cwd: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const c = spawn(execPath, [binPath, 'status'], { cwd, env: realCliEnv(), timeout: 15000 });
    let o = '', e = ''; c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    c.stdout.on('data', (d: string) => { o += d; }); c.stderr.on('data', (d: string) => { e += d; });
    c.on('exit', (s) => { resolve({ status: s, stdout: o, stderr: e }); });
  });
}

export function forceKillProcess(pid: number): void {
  if (process.platform === 'win32') { spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)]); return; }
  try { try { process.kill(pid, 0); } catch { return; } process.kill(pid, 'SIGKILL'); } catch { /* process may have already exited */ }
}

export async function stopDaemonChild(child: ReturnType<typeof spawn>, root: string, port: number): Promise<void> {
  if (child.exitCode !== null) return;
  try {
    const t = (await readFile(join(root, '.svp', '.svp-daemon-token'), 'utf8')).trim().split('\n')[0] ?? '';
    if (t) await postJson(port, '/api/v1/shutdown', { token: t });
  } catch { /* best-effort */ }
  const waitMs = (ms: number): Promise<void> => new Promise((r) => { child.once('exit', () => { r(); }); setTimeout(() => { r(); }, ms).unref(); });
  await waitMs(5000);
  /* child.exitCode can be set by the exit event during the async wait
   * above, re-checking it is a deliberate runtime-safety guard that TS's
   * narrowed type cannot account for. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const childAlive = child.exitCode === null;
  if (childAlive && child.pid !== undefined) { forceKillProcess(child.pid); await waitMs(5000); }
}

export async function pollDaemon(port: number): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await new Promise<{ statusCode: number | undefined }>((resolve, reject) => {
        const req = httpGet(`http://127.0.0.1:${port}/api/v1/health`, (res2) => { resolve({ statusCode: res2.statusCode }); });
        req.on('error', reject); req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      if (res.statusCode === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('daemon did not start');
}

export function fakePort(known: string): WorkspacePort {
  return {
    canonicalWorkspaceRoot(cwd: string): string | null { return cwd === known ? known : null; },
    workspaceIdentity(): string | null { return known; },
    sameWorkspace(a: string, b: string): boolean { return a === known && b === known; },
  };
}

let daemonIndex = 0;
export function nextIndex(): number { return ++daemonIndex; }
