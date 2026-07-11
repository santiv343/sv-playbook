import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import { stringColumn } from '../db/rows.js';
import { createPacket, movePacket, ensureSession, startPacket } from '../tasks/service.js';
import { runPreflight } from '../review/preflight.js';

async function setupPreflightRepo() {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-'));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
  execFileSync('git', ['checkout', '-b', 'feature/preflight-test'], { cwd: root });
  await mkdir(join(root, 'src', 'redteam'), { recursive: true });
  await mkdir(join(root, 'outside'), { recursive: true });
  await writeFile(join(root, 'src', 'redteam', 'ok.ts'), '// ok\n', 'utf8');
  await writeFile(join(root, 'outside', 'evil.ts'), '// violation\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'preflight changes'], { cwd: root });
  return root;
}

const def = (id: string) => ({
  id, title: `Preflight ${id}`, dependsOn: [],
  writeSet: ['src/redteam/**'], requirements: [], evidenceRequired: ['final-sha'],
});

test('review preflight aggregates the mechanical checks and a write_set violation fails it before any reviewer runs', async () => {
  const root = await setupPreflightRepo();
  const store = openStore(root);
  createPacket(store, root, def('GATE-004-TEST'), 'body');
  movePacket(store, undefined, 'GATE-004-TEST', 'ready');
  const session = ensureSession(store, root);
  startPacket(store, session, root, 'GATE-004-TEST');

  const report = runPreflight(store, 'GATE-004-TEST', root);

  assert.ok(report.writeSetViolations.length > 0, 'should have write_set violations');
  assert.ok(report.writeSetViolations.some((f) => f.includes('outside/evil.ts')), 'should name the violating file');
  assert.equal(report.overall, 'fail', 'overall should be FAIL when violations exist');

  const evRow = store.db.prepare(
    "SELECT detail FROM events WHERE packet_id = ? AND command = 'evidence' AND detail LIKE 'preflight:%' ORDER BY seq DESC LIMIT 1"
  ).get('GATE-004-TEST');
  assert.ok(evRow !== undefined, 'preflight event should exist');
  assert.equal(stringColumn(evRow, 'detail'), 'preflight:fail', 'preflight event should record fail');

  execFileSync('git', ['rm', 'outside/evil.ts'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'remove violation'], { cwd: root });

  const report2 = runPreflight(store, 'GATE-004-TEST', root);

  assert.equal(report2.writeSetViolations.length, 0, 'no violations after fix');
  assert.equal(report2.overall, 'pass', 'overall should be PASS after fix');
  assert.ok(report2.checks.length >= 1, 'checks should be populated');
  assert.ok(report2.checks.every((c) => c.status !== 'unknown'), 'every check should be populated');

  store.close();
});
