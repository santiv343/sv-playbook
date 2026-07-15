import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openStore } from '../db/store.js';
import { createPacket } from '../tasks/service.js';
import { PREFLIGHT_VERIFY_DETAIL } from './preflight.constants.js';
import { runPreflight } from './preflight.js';
import { PREFLIGHT_STATUS } from './preflight.types.js';

const git = (root: string, args: readonly string[]): void => {
  execFileSync('git', args, { cwd: root, stdio: 'pipe' });
};

test('preflight rejects a verify command that dirties tracked candidate files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, '.gitignore'), '.svp/\n.svp-session\n', 'utf8');
  await writeFile(join(root, 'README.md'), 'clean\n', 'utf8');
  await writeFile(join(root, '.verify-runner.cjs'), [
    "const fs = require('node:fs');",
    "fs.appendFileSync('README.md', 'dirty\\n');",
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: 'node .verify-runner.cjs',
  }), 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);

  const store = openStore(root);
  createPacket(store, root, {
    id: 'PREFLIGHT-001',
    title: 'Preflight fixture',
    dependsOn: [],
    writeSet: ['README.md'],
    requirements: [],
    evidenceRequired: [],
    tags: [],
  }, 'Verify cleanliness.');
  git(root, ['add', 'docs/packets/PREFLIGHT-001.md']);
  git(root, ['commit', '-m', 'task definition']);

  const report = runPreflight(store, 'PREFLIGHT-001', root, { pr: undefined, persistEvent: false });

  assert.equal(report.verifyResult.status, PREFLIGHT_STATUS.FAIL);
  assert.equal(report.verifyResult.detail, PREFLIGHT_VERIFY_DETAIL.DIRTY_WORKTREE);
  store.close();
});
