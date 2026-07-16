import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { changedFilesForBase } from './git.js';

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
}

test('configured review base wins over a stale remote-tracking reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-git-base-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, 'initial.txt'), 'initial\n', 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'initial']);
  const staleRemoteSha = git(root, ['rev-parse', 'HEAD']);
  await writeFile(join(root, 'baseline.txt'), 'local baseline\n', 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'local baseline']);
  git(root, ['update-ref', 'refs/remotes/origin/main', staleRemoteSha]);
  git(root, ['checkout', '-b', 'feature/exact-base']);
  await writeFile(join(root, 'feature.txt'), 'feature\n', 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'feature']);

  assert.deepEqual(changedFilesForBase(root, 'main'), ['feature.txt']);
  assert.deepEqual(changedFilesForBase(root, 'origin/main'), ['baseline.txt', 'feature.txt']);
});
