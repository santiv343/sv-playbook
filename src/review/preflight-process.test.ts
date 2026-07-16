import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { executePreflightCommand } from './preflight-process.js';

const TEST_TIMEOUT_MS = 1_000;
const TREE_SETTLE_MS = 400;

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, durationMs); });
}

test('preflight command inactivity resets whenever stdout advances', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-progress-'));
  await writeFile(join(root, 'active.cjs'), [
    'let count = 0; console.log(String(count));',
    "const timer = setInterval(() => { count += 1; console.log(String(count)); if (count === 5) { clearInterval(timer); } }, 250);",
  ].join('\n'), 'utf8');

  const result = await executePreflightCommand('node active.cjs', root, TEST_TIMEOUT_MS);

  assert.equal(result.timedOut, false);
  assert.equal(result.exitCode, 0);
  assert.ok(result.durationMs > TEST_TIMEOUT_MS);
});

test('preflight command terminates after configured observable inactivity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-silent-'));
  await writeFile(join(root, 'silent.cjs'), 'setTimeout(() => process.exit(0), 3_000);\n', 'utf8');

  const result = await executePreflightCommand('node silent.cjs', root, TEST_TIMEOUT_MS);

  assert.equal(result.timedOut, true);
  assert.notEqual(result.exitCode, 0);
});

test('inactivity termination includes descendant processes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-tree-'));
  const heartbeat = join(root, 'heartbeat.log');
  const pidFile = join(root, 'descendant.pid');
  await writeFile(join(root, 'descendant.cjs'), [
    "const fs = require('node:fs');",
    "const path = require('node:path').join(process.cwd(), 'heartbeat.log');",
    "setInterval(() => fs.appendFileSync(path, 'x'), 50);",
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'parent.cjs'), [
    "const fs = require('node:fs');",
    "const { spawn } = require('node:child_process');",
    "const child = spawn(process.execPath, ['descendant.cjs'], { cwd: process.cwd(), stdio: 'ignore' });",
    "fs.writeFileSync('descendant.pid', String(child.pid));",
    'setInterval(() => undefined, 50);',
  ].join('\n'), 'utf8');

  try {
    const result = await executePreflightCommand('node parent.cjs', root, TEST_TIMEOUT_MS);
    assert.equal(result.timedOut, true);
    await delay(TREE_SETTLE_MS);
    const settledSize = (await stat(heartbeat)).size;
    await delay(TREE_SETTLE_MS);
    assert.equal((await stat(heartbeat)).size, settledSize);
  } finally {
    const descendantPid = Number(await readFile(pidFile, 'utf8'));
    try { process.kill(descendantPid, 'SIGKILL'); } catch { /* already terminated */ }
  }
});
