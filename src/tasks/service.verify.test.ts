import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import {
  createPacket,
  ensureSession,
  movePacket,
  startPacket,
} from './service.js';
import { initTestRepo } from '../testkit.js';

test('move to review runs the configured verify command through the shell', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-verify-shell-'));
  initTestRepo(root);
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  execFileSync('git', ['checkout', '-b', 'feature/verify-shell-test'], { cwd: root });
  await mkdir(join(root, 'src', 'a'), { recursive: true });
  await writeFile(join(root, 'src', 'a', 'ok.ts'), ' ', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'x'], { cwd: root });
  await writeFile(
    join(root, 'playbook.config.json'),
    JSON.stringify({ verifyCommand: 'node -e "require(\'node:fs\').writeFileSync(\'verify-marker.txt\',\'ok\')"' }),
    'utf8',
  );
  const store = openStore(root);
  createPacket(store, root, {
    id: 'VERIFY-SHELL-001',
    title: 'verify shell',
    dependsOn: [],
    writeSet: ['src/a/**'],
    requirements: [],
    evidenceRequired: [],
  }, 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'VERIFY-SHELL-001', 'ready');
  startPacket(store, s1, root, 'VERIFY-SHELL-001');
  movePacket(store, s1, 'VERIFY-SHELL-001', 'review');
  assert.equal(await readFile(join(root, 'verify-marker.txt'), 'utf8'), 'ok');
});
