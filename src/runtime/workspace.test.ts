import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync, mkdirSync, symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitWorkspace } from './workspace-git.js';
import type { WorkspacePort } from './workspace.types.js';

function initRepo(root: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
}

function fakePort(known: string): WorkspacePort {
  return {
    canonicalWorkspaceRoot(cwd: string): string | null { return cwd === known ? known : null; },
    workspaceIdentity(): string | null { return known; },
    sameWorkspace(a: string, b: string): boolean { return a === known && b === known; },
  };
}

test('fake port canonicalWorkspaceRoot returns known path for matching cwd', () => {
  const fp = fakePort('/repo');
  assert.equal(fp.canonicalWorkspaceRoot('/repo'), '/repo');
  assert.equal(fp.canonicalWorkspaceRoot('/other'), null);
});

test('fake port sameWorkspace rejects different paths', () => {
  const fp = fakePort('/repo');
  assert.ok(fp.sameWorkspace('/repo', '/repo'));
  assert.ok(!fp.sameWorkspace('/repo', '/different'));
});

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

test('RED: nested independent repo is rejected by sameWorkspace', async () => {
  const outer = await mkdtemp(join(tmpdir(), 'svp-red-nest-outer-'));
  const inner = join(outer, 'inner');
  initRepo(outer); mkdirSync(inner); initRepo(inner);
  assert.ok(gitWorkspace.canonicalWorkspaceRoot(inner) !== null);
  assert.ok(!gitWorkspace.sameWorkspace(outer, inner), 'nested repo must not match outer');
});

test('RED: prefix-collision repo names are not the same workspace', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'svp-red-prefix-'));
  const a = join(parent, 'my-repo'); mkdirSync(a); initRepo(a);
  const b = join(parent, 'my-repo-evil'); mkdirSync(b); initRepo(b);
  assert.ok(!gitWorkspace.sameWorkspace(a, b), 'prefix-collision repos must not match');
});

function canSymlinkDir(): boolean {
  let d = '';
  try {
    d = mkdtempSync(join(tmpdir(), 'svp-symprobe-'));
    const t = join(d, 'target'); mkdirSync(t);
    const l = join(d, 'link');
    symlinkSync(t, l, 'junction');
    const r = realpathSync(l);
    return r !== l;
  } catch { return false; } finally { if (d) try { rmSync(d, { recursive: true, force: true }); } catch { } }
}

const symSkip = process.platform === 'win32' ? 'Windows does not support symlinks without dev mode' : '';

test('RED: same-repo directory junction alias accepted by canonicalWorkspaceRoot', { skip: !canSymlinkDir() && symSkip }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-red-sym-acc-'));
  initRepo(root); const target = join(root, 'sub'); mkdirSync(target);
  const link = join(root, 'alias');
  symlinkSync(target, link, 'junction');
  const canonical = gitWorkspace.canonicalWorkspaceRoot(link);
  assert.ok(canonical !== null, 'same-repo symlink must resolve to a workspace');
  assert.equal(realpathSync(canonical).toLowerCase(), realpathSync(root).toLowerCase(), 'same-repo symlink must resolve to the repo root');
});

test('RED: symlink escape to different repo is rejected by sameWorkspace', { skip: !canSymlinkDir() && symSkip }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-red-sym-rej-'));
  initRepo(root);
  const outside = await mkdtemp(join(tmpdir(), 'svp-red-sym-rej-out-'));
  initRepo(outside);
  const link = join(root, 'escape');
  symlinkSync(outside, link, 'junction');
  const canonical = gitWorkspace.canonicalWorkspaceRoot(link);
  assert.ok(canonical !== null, 'symlink to different repo still resolves to a workspace');
  assert.ok(!gitWorkspace.sameWorkspace(canonical, root),
    'symlink escape must not match the bound repo');
});
