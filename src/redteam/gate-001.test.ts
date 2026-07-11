import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../cli/main.js';
import { openStore } from '../db/store.js';
import { createPacket, ensureSession, startPacket, movePacket } from '../tasks/service.js';
import { setSessionRole } from '../cli/destructive-gate.js';
import { stringColumn } from '../db/rows.js';
import { STATUS, EVENT_DESTRUCTIVE } from '../tasks/service.constants.js';

function fakeIo(): { outLines: string[]; errLines: string[]; out: (l: string) => void; err: (l: string) => void } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-gate-'));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try { return await fn(root); } finally { process.chdir(previous); }
}

test('a non-founder role invoking a destructive command is refused with the decision-request path', async () => {
  await inTempRepo(async (root) => {
    await mkdir(join(root, 'docs', 'packets'), { recursive: true });
    await writeFile(join(root, 'docs', 'packets', 'FIXTURE-001.md'), [
      '---',
      'id: FIXTURE-001',
      'title: fixture',
      'depends_on: []',
      'write_set: ["src/**"]',
      'requirements: []',
      'evidence_required: []',
      '---',
      '',
      'closed: done',
    ].join('\n'), 'utf8');

    const store = openStore(root);
    const sessionId = ensureSession(store, root);
    store.close();

    // Non-founder role → refused with decision-request path
    setSessionRole(root, sessionId, 'delivery-orchestrator');
    const io = fakeIo();
    const code = await main(['rebuild', '--force'], io);
    assert.equal(code, 1);
    const errs = io.errLines.join('\n');
    assert.match(errs, /destructive action/);
    assert.match(errs, /decision ask/);

    // Founder without --confirm-destructive → refused with counts printed
    setSessionRole(root, sessionId, 'founder');
    const io2 = fakeIo();
    const code2 = await main(['rebuild', '--force'], io2);
    assert.equal(code2, 1);
    const errs2 = io2.errLines.join('\n');
    assert.match(errs2, /done packet/);
    assert.match(errs2, /confirm-destructive/);

    // Founder with --confirm-destructive → proceeds
    const io3 = fakeIo();
    const code3 = await main(['rebuild', '--force', '--confirm-destructive'], io3);
    const out3 = io3.outLines.join('\n');
    assert.equal(code3, 0);
    assert.match(out3, /reconstructed/);

    // Verify events recorded
    const store2 = openStore(root);
    const rows = store2.db.prepare('SELECT command, detail FROM events WHERE command = ?').all(EVENT_DESTRUCTIVE);
    store2.close();
    assert.ok(rows.length === 3, `expected 3 destructive events, got ${rows.length}`);
  });
});

test('a founder session (no role) without --confirm-destructive is refused with counts', async () => {
  await inTempRepo(async (root) => {
    await mkdir(join(root, 'docs', 'packets'), { recursive: true });
    await writeFile(join(root, 'docs', 'packets', 'FIXTURE-002.md'), [
      '---',
      'id: FIXTURE-002',
      'title: fixture',
      'depends_on: []',
      'write_set: ["src/**"]',
      'requirements: []',
      'evidence_required: []',
      '---',
      '',
      'closed: done',
    ].join('\n'), 'utf8');

    // No role set → session has no role
    const io = fakeIo();
    const code = await main(['rebuild', '--force'], io);
    assert.equal(code, 1);
    const errs = io.errLines.join('\n');
    assert.match(errs, /done packet/);
    assert.match(errs, /confirm-destructive/);
  });
});

test('task takeover --force requires --confirm-destructive for no-role sessions', async () => {
  await inTempRepo(async (root) => {
    const store = openStore(root);
    createPacket(store, root, { id: 'GATE-TASK-001', title: 'x', dependsOn: [], writeSet: ['src/**'], requirements: [], evidenceRequired: [] }, '');
    movePacket(store, undefined, 'GATE-TASK-001', STATUS.READY);
    const session = ensureSession(store, root);
    startPacket(store, session, root, 'GATE-TASK-001');
    store.close();

    // Without --confirm-destructive → refused
    const io = fakeIo();
    const code = await main(['task', 'takeover', 'GATE-TASK-001', '--force'], io);
    assert.equal(code, 1);
    assert.match(io.errLines.join('\n'), /confirm-destructive/);
  });
});
