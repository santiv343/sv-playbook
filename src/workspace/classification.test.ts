import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openStore } from '../db/store.js';
import { createPacket, movePacket } from '../tasks/service.js';
import { classifyWorkspace } from './classification.js';
import { WORKSPACE_OWNERSHIP } from './classification.constants.js';
import { initTestRepo } from '../testkit.js';

const definition = (id: string, writeSet: string[]) => ({
  id,
  title: id,
  dependsOn: [],
  writeSet,
  requirements: [],
  evidenceRequired: ['final-sha'],
});

test('workspace classification assigns every dirty path without LLM judgment', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-workspace-classification-'));
  initTestRepo(root);
  await writeFile(join(root, '.gitignore'), '.svp/\n.svp-session\ndocs/packets/\n');
  execFileSync('git', ['add', '.gitignore'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'initial'], { cwd: root });
  const store = openStore(root);

  createPacket(store, root, definition('ACTIVE-001', ['src/current/**']), 'active');
  movePacket(store, undefined, 'ACTIVE-001', 'ready');
  createPacket(store, root, definition('DRAFT-001', ['src/planned/**']), 'planned');
  createPacket(store, root, definition('AMBIGUOUS-001', ['src/shared/**']), 'shared');
  createPacket(store, root, definition('AMBIGUOUS-002', ['src/shared/file.ts']), 'shared');

  await mkdir(join(root, 'src', 'current'), { recursive: true });
  await mkdir(join(root, 'src', 'planned'), { recursive: true });
  await mkdir(join(root, 'src', 'shared'), { recursive: true });
  await writeFile(join(root, 'src', 'current', 'file.ts'), 'current');
  await writeFile(join(root, 'src', 'planned', 'file.ts'), 'planned');
  await writeFile(join(root, 'src', 'shared', 'file.ts'), 'shared');
  await writeFile(join(root, 'orphan.txt'), 'orphan');

  const report = classifyWorkspace(store, root);
  const byPath = new Map(report.paths.map((entry) => [entry.path, entry]));

  assert.equal(byPath.get('src/current/file.ts')?.ownership, WORKSPACE_OWNERSHIP.CURRENT);
  assert.equal(byPath.get('src/planned/file.ts')?.ownership, WORKSPACE_OWNERSHIP.PLANNED);
  assert.equal(byPath.get('src/shared/file.ts')?.ownership, WORKSPACE_OWNERSHIP.AMBIGUOUS);
  assert.equal(byPath.get('orphan.txt')?.ownership, WORKSPACE_OWNERSHIP.ORPHAN);
  assert.deepEqual(report.summary, { current: 1, planned: 1, 'multiple-non-terminal': 1, 'terminal-only': 0, orphan: 1 });

  store.close();
});
