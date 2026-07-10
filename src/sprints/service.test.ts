import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openStore } from '../db/store.js';
import { stringColumn } from '../db/rows.js';
import {
  createPacket,
  ensureSession,
  movePacket,
  startPacket,
} from '../tasks/service.js';
import {
  createSprint,
  addTaskToSprint,
  recordTaskCost,
  showSprint,
} from './service.js';

const def = (id: string, ws: string): { id: string; title: string; dependsOn: string[]; writeSet: string[]; requirements: string[]; evidenceRequired: string[] } =>
  ({ id, title: `Packet ${id}`, dependsOn: [], writeSet: [ws], requirements: [], evidenceRequired: ['final-sha'] });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'svp-sprint-'));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'x'], { cwd: root });
  return { root, store: openStore(root) };
}

test('a sprint enforces its wip limit and rolls up task costs against its budget', async () => {
  const { root, store } = await setup();
  const sessionId = ensureSession(store, root);

  const sprintId = createSprint(store, { goal: 'Test sprint', budget: 100, wip: 1 });
  await writeFile(join(root, 'body1.md'), 'Task 1');
  createPacket(store, root, def('FEAT-001', 'src/a/**'), 'Task 1 body');
  createPacket(store, root, def('FEAT-002', 'src/b/**'), 'Task 2 body');
  addTaskToSprint(store, sprintId, 'FEAT-001');
  addTaskToSprint(store, sprintId, 'FEAT-002');

  movePacket(store, undefined, 'FEAT-001', 'ready');
  startPacket(store, sessionId, root, 'FEAT-001');
  assert.equal(stringColumn(store.db.prepare('SELECT status FROM packets WHERE id = ?').get('FEAT-001'), 'status'), 'active');

  movePacket(store, undefined, 'FEAT-002', 'ready');
  assert.throws(() => {
    startPacket(store, sessionId, root, 'FEAT-002');
  }, /WIP/);

  recordTaskCost(store, 'FEAT-001', 30);
  recordTaskCost(store, 'FEAT-001', 15);

  const summary = showSprint(store, sprintId);
  assert.equal(summary.spent, 45);
  assert.equal(summary.budgetCap, 100);
  assert.equal(summary.goal, 'Test sprint');

  store.close();
});
