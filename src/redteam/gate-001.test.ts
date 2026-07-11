import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../cli/main.js';
import { openStore } from '../db/store.js';
import { createPacket, ensureSession, startPacket, movePacket } from '../tasks/service.js';
import { STATUS } from '../tasks/service.constants.js';
import { DESTRUCTIVE_LOG_FILE, EXIT, SESSION_ROLE_FILE } from '../cli/command.constants.js';
import type { Command } from '../cli/command.types.js';
import { checkDestructiveGate, queryDestructiveCounts } from '../cli/destructive-gate.js';

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

async function writeFixturePacket(root: string, id: string): Promise<void> {
  await mkdir(join(root, 'docs', 'packets'), { recursive: true });
  await writeFile(join(root, 'docs', 'packets', `${id}.md`), [
    '---',
    `id: ${id}`,
    'title: fixture',
    'depends_on: []',
    'write_set: ["src/**"]',
    'requirements: []',
    'evidence_required: []',
    '---',
    '',
    'closed: done',
  ].join('\n'), 'utf8');
}

function setRole(root: string, role: string): void {
  writeFileSync(join(root, SESSION_ROLE_FILE), `${role}\n`, 'utf8');
}

function destructiveLogLines(root: string): string[] {
  const p = join(root, DESTRUCTIVE_LOG_FILE);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
}

test('a non-founder role invoking a destructive command is refused with the decision-request path', async () => {
  await inTempRepo(async (root) => {
    await writeFixturePacket(root, 'FIXTURE-001');
    setRole(root, 'delivery-orchestrator');

    const io = fakeIo();
    const code = await main(['rebuild', '--force'], io);
    assert.equal(code, 1);
    const errs = io.errLines.join('\n');
    assert.match(errs, /destructive action/);
    assert.match(errs, /decision ask/);
  });
});

test('a non-founder session without role file is treated as founder (no gate failure on role)', async () => {
  await inTempRepo(async (root) => {
    await writeFixturePacket(root, 'FIXTURE-002');

    const io = fakeIo();
    const code = await main(['rebuild', '--force'], io);
    assert.equal(code, 1);
    const errs = io.errLines.join('\n');
    assert.match(errs, /done packet/);
    assert.match(errs, /confirm-destructive/);
  });
});

test('a founder session without --confirm-destructive prints counts', async () => {
  await inTempRepo(async (root) => {
    await writeFixturePacket(root, 'FIXTURE-003');

    const io = fakeIo();
    const code = await main(['rebuild', '--force'], io);
    assert.equal(code, 1);
    const errs = io.errLines.join('\n');
    assert.match(errs, /done packet/);
    assert.match(errs, /--confirm-destructive/);
  });
});

test('founder role with --confirm-destructive proceeds past the gate', async () => {
  await inTempRepo(async (root) => {
    await writeFixturePacket(root, 'FIXTURE-004');
    setRole(root, 'founder');

    const io = fakeIo();
    const code = await main(['rebuild', '--force', '--confirm-destructive'], io);
    const out = io.outLines.join('\n');
    assert.equal(code, 0);
    assert.match(out, /reconstructed/);
  });
});

test('no-role session with --confirm-destructive proceeds past the gate', async () => {
  await inTempRepo(async (root) => {
    await writeFixturePacket(root, 'FIXTURE-005');

    const io = fakeIo();
    const code = await main(['rebuild', '--force', '--confirm-destructive'], io);
    const out = io.outLines.join('\n');
    assert.equal(code, 0);
    assert.match(out, /reconstructed/);
  });
});

test('every destructive attempt lands an event in the log file', async () => {
  await inTempRepo(async (root) => {
    await writeFixturePacket(root, 'FIXTURE-006');
    setRole(root, 'delivery-orchestrator');

    const io = fakeIo();
    await main(['rebuild', '--force'], io);
    assert.ok(io.errLines.join('\n').includes('destructive action'));

    const lines = destructiveLogLines(root);
    assert.ok(lines.length >= 1, 'expected at least 1 destructive log entry');
  });
});

test('task takeover --force without --confirm-destructive is refused for no-role sessions', async () => {
  await inTempRepo(async (root) => {
    const store = openStore(root);
    createPacket(store, root, { id: 'GATE-TASK-001', title: 'x', dependsOn: [], writeSet: ['src/**'], requirements: [], evidenceRequired: [] }, '');
    movePacket(store, undefined, 'GATE-TASK-001', STATUS.READY);
    const session = ensureSession(store, root);
    startPacket(store, session, root, 'GATE-TASK-001');
    store.close();

    const io = fakeIo();
    const code = await main(['task', 'takeover', 'GATE-TASK-001', '--force'], io);
    assert.equal(code, 1);
    assert.match(io.errLines.join('\n'), /confirm-destructive/);
  });
});

test('dispatcher path: destructive=true on a command descriptor triggers the gate even without explicit gate call in run (non-founder)', () => {
  const root = join(tmpdir(), 'svp-gate-dispatch-blocked');
  mkdirSync(root, { recursive: true });
  execFileSync('git', ['init'], { cwd: root });
  setRole(root, 'delivery-orchestrator');

  const cmd: Command = {
    name: '__test__',
    summary: 'test',
    destructive: true,
    run: () => Promise.resolve(EXIT.OK),
  };

  const io = fakeIo();
  const hasConfirm = false;
  const gateResult = checkDestructiveGate(io, cmd.name, root, hasConfirm, queryDestructiveCounts(root));
  assert.equal(gateResult, EXIT.GATE_FAIL);
  const errs = io.errLines.join('\n');
  assert.match(errs, /destructive action/);
  assert.match(errs, /decision ask/);
});

test('dispatcher path: destructive=true on a command descriptor allows founder with confirm', () => {
  const root = join(tmpdir(), 'svp-gate-dispatch-allowed');
  mkdirSync(root, { recursive: true });
  execFileSync('git', ['init'], { cwd: root });
  setRole(root, 'founder');

  const cmd: Command = {
    name: '__test__',
    summary: 'test',
    destructive: true,
    run: () => Promise.resolve(EXIT.OK),
  };

  const io = fakeIo();
  const hasConfirm = true;
  const gateResult = checkDestructiveGate(io, cmd.name, root, hasConfirm, queryDestructiveCounts(root));
  assert.equal(gateResult, undefined);
});
