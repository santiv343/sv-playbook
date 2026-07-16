import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import { DAEMON_ROUTE, DAEMON_TOKEN_FILE } from '../daemon/daemon.constants.js';
import { SVP_DIR } from '../db/store.constants.js';
import { PROCESS_EVENT, PROCESS_STDIO, TEXT_ENCODING } from '../platform.constants.js';
import { freePort, initFixtureRepo, nextIndex, pollDaemon, postJson, realCliEnv, stopDaemonChild, withDeadline } from './daemon-test-utils.test.support.js';

const CHILD_TIMEOUT_MS = 20000;
const EXIT_TIMEOUT_MS = 10000;

test('ACC-09: the shutdown endpoint terminates the daemon process with exit code 0', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-shutdown-${nextIndex()}`));
  initFixtureRepo(root);
  openStore(root).close();
  const port = await freePort();
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const child = spawn(process.execPath, [binPath, 'daemon', '--port', String(port)], {
    cwd: root,
    env: realCliEnv(),
    stdio: [PROCESS_STDIO.IGNORE, PROCESS_STDIO.PIPE, PROCESS_STDIO.PIPE],
    timeout: CHILD_TIMEOUT_MS,
  });
  const exited = new Promise<number | null>((resolve) => {
    child.on(PROCESS_EVENT.EXIT, (code) => { resolve(code); });
  });
  try {
    await pollDaemon(port);
    const token = (await readFile(join(root, SVP_DIR, DAEMON_TOKEN_FILE), TEXT_ENCODING.UTF8)).trim().split('\n')[0] ?? '';
    assert.notEqual(token, '', 'daemon token must be readable');
    const response = await postJson(port, DAEMON_ROUTE.SHUTDOWN, { token });
    assert.equal(response.statusCode, 200, `shutdown must respond 200, got ${response.statusCode}`);
    assert.ok(response.body.includes('shutdown'), `body: ${response.body}`);
    const exitCode = await withDeadline(exited, EXIT_TIMEOUT_MS, 'daemon child did not exit after shutdown');
    assert.equal(exitCode, 0, 'daemon child must exit 0 after a clean shutdown');
  } finally {
    await stopDaemonChild(child, root, port);
  }
});
