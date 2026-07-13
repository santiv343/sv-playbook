import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withDeadline } from './daemon-lifecycle-helpers.js';
import { realCliEnv, freePort, initFixtureRepo, postJson, nextIndex } from './daemon-test-utils.js';

async function escalateChild(
  pid: number,
  exited: Promise<number | null>,
  cleanupErrors: string[],
): Promise<void> {
  try {
    if (process.platform === 'win32') {
      const { spawnSync } = await import('node:child_process');
      spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)]);
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch (e: unknown) { cleanupErrors.push(`escalate:${e instanceof Error ? e.message : String(e)}`); }
  try {
    await withDeadline(exited, 5000, 'child did not exit after force kill');
  } catch (e: unknown) { cleanupErrors.push(`terminal:${e instanceof Error ? e.message : String(e)}`); }
}

async function terminateChild(
  childRef: ReturnType<typeof spawn>,
  exited: Promise<number | null>,
  cleanupErrors: string[],
): Promise<void> {
  try { childRef.kill(); } catch (e: unknown) { cleanupErrors.push(`kill:${e instanceof Error ? e.message : String(e)}`); }
  try {
    await withDeadline(exited, 5000, 'child did not exit after kill');
  } catch {
    if (childRef.pid !== undefined) await escalateChild(childRef.pid, exited, cleanupErrors);
  }
}

// ---- 8. Shutdown via async child: no process.exit ----
test('red team: shutdown endpoint does not call process.exit — async child survival (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-shut-${nextIndex()}`));
  initFixtureRepo(root);
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const port = await freePort();

  const child = spawn(process.execPath, [binPath, 'daemon', '--port', String(port)], {
    cwd: root, env: realCliEnv(), stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
  });

  const exited = new Promise<number | null>((resolveExit) => {
    child.on('exit', (c) => { resolveExit(c); });
  });

  let primaryError: Error | null = null;
  const cleanupErrors: string[] = [];

  try {
    const stdout = child.stdout;
    const ready = new Promise<void>((resolveReady) => {
      let childOut = '';
      stdout.setEncoding('utf8');
      stdout.on('data', (d: string) => {
        childOut += d;
        if (childOut.includes('ready')) resolveReady();
      });
    });
    await withDeadline(ready, 10000, 'daemon not ready');

    const { readFile } = await import('node:fs/promises');
    const token = (await readFile(join(root, '.svp', '.svp-daemon-token'), 'utf8')).trim().split('\n')[0] ?? '';
    assert.ok(token.length > 0, 'daemon token must be readable');

    const sr = await postJson(port, '/api/v1/shutdown', { token });
    assert.equal(sr.statusCode, 200, 'shutdown must respond 200');
    assert.ok(sr.body.includes('shutdown'), `body: ${sr.body}`);

    const exitCode = await withDeadline(exited, 10000, 'child did not exit');
    assert.equal(exitCode, 0, 'child must exit 0 after shutdown');
  } catch (e: unknown) {
    primaryError = e instanceof Error ? e : new Error(String(e));
  } finally {
    await terminateChild(child, exited, cleanupErrors);
    if (primaryError !== null && cleanupErrors.length > 0) {
      throw new AggregateError([primaryError, new Error(`cleanup: ${cleanupErrors.join('; ')}`)], 'test+cleanup');
    }
    if (primaryError !== null || cleanupErrors.length > 0) {
      throw primaryError ?? new Error(`cleanup: ${cleanupErrors.join('; ')}`);
    }
  }
});
