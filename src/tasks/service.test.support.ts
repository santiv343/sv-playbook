import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';

export function initializeTestGitRepository(root: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root, stdio: 'pipe' });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'initial'], { cwd: root, stdio: 'pipe' });
}

export async function setupServiceTest() {
  const root = await mkdtemp(join(tmpdir(), 'svp-life-'));
  initializeTestGitRepository(root);
  return { root, store: openStore(root) };
}
