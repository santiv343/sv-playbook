import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitWorkspace } from './workspace-git.js';

function initRepo(root: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
}

test('workspace identity is stable for the same repo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-ws-id-'));
  initRepo(root);
  const id = gitWorkspace.workspaceIdentity(root);
  assert.ok(id !== null);
  assert.equal(id, gitWorkspace.workspaceIdentity(root));
});

test('canonicalWorkspaceRoot resolves the repo root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-ws-root-'));
  initRepo(root);
  const canonical = gitWorkspace.canonicalWorkspaceRoot(root);
  assert.ok(canonical !== null);
  const normalized = realpathSync(canonical);
  const expected = realpathSync(root);
  assert.equal(normalized.toLowerCase(), expected.toLowerCase());
});

test('canonicalWorkspaceRoot returns null for outside-repo paths', () => {
  assert.equal(gitWorkspace.canonicalWorkspaceRoot(tmpdir()), null);
  assert.equal(gitWorkspace.canonicalWorkspaceRoot(join(tmpdir(), 'nonexistent')), null);
});

test('sameWorkspace returns true for the same path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-ws-same-'));
  initRepo(root);
  assert.ok(gitWorkspace.sameWorkspace(root, root));
  assert.ok(gitWorkspace.sameWorkspace(root, join(root, '.git')));
});

test('sameWorkspace returns false for paths in different repos', async () => {
  const a = await mkdtemp(join(tmpdir(), 'svp-ws-diff-a-'));
  const b = await mkdtemp(join(tmpdir(), 'svp-ws-diff-b-'));
  initRepo(a);
  initRepo(b);
  assert.ok(!gitWorkspace.sameWorkspace(a, b));
});
