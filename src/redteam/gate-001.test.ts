import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../cli/main.js';
import { openStore } from '../db/store.js';
import { setSessionRole } from '../cli/commands/rebuild.js';

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
  try {
    return await fn(root);
  } finally {
    process.chdir(previous);
  }
}

test('a non-founder role invoking a destructive command is refused with the decision-request path', async () => {
  await inTempRepo(async (root) => {
    await mkdir(join(root, 'docs', 'packets'), { recursive: true });
    await writeFile(join(root, 'docs', 'packets', 'SOME-001.md'), [
      '---',
      'id: SOME-001',
      'title: fixture',
      'depends_on: []',
      'write_set: ["src/**"]',
      'requirements: []',
      'evidence_required: []',
      '---',
      '',
      'closed: done',
      '',
    ].join('\n'), 'utf8');

    const store = openStore(root);
    const { ensureSession, startPacket, movePacket, createPacket } = await import('../tasks/service.js');
    createPacket(store, root, { id: 'GATE-FIX-001', title: 'x', dependsOn: [], writeSet: ['src/**'], requirements: [], evidenceRequired: [] }, '');
    movePacket(store, undefined, 'GATE-FIX-001', 'ready');
    const session = ensureSession(store, root);
    startPacket(store, session, root, 'GATE-FIX-001');
    store.close();

    setSessionRole(root, 'delivery-orchestrator');

    const io = fakeIo();
    const code = await main(['rebuild', '--force'], io);
    assert.equal(code, 1);
    const errs = io.errLines.join('\n');
    assert.match(errs, /destructive action/);
    assert.match(errs, /decision ask/);

    setSessionRole(root, 'founder');
    const io2 = fakeIo();
    const code2 = await main(['rebuild', '--force'], io2);
    assert.equal(code2, 1);
    const errs2 = io2.errLines.join('\n');
    assert.match(errs2, /done packets/);
    assert.match(errs2, /confirm-destructive/);

    const io3 = fakeIo();
    const code3 = await main(['rebuild', '--force', '--confirm-destructive'], io3);
    assert.equal(code3, 0);
    assert.match(io3.outLines.join('\n'), /reconstructed/);
  });
});
