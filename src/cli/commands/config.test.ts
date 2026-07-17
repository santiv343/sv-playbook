import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command as configCommand } from './config.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';
import { initTestRepo } from '../../testkit.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-config-'));
  initTestRepo(root);
  const prev = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

test('config get reads a nested key', async () => {
  await inTempRepo(async () => {
    const io = fakeIo();
    assert.equal(await configCommand.run(['get', 'tasks.leaseTtlMs'], io), 0);
    assert.equal(io.outLines.join('\n').trim(), '1800000');
  });
});

test('config set validates against PlaybookConfigSchema before writing', async () => {
  await inTempRepo(async () => {
    const io = fakeIo();
    assert.equal(await configCommand.run(['set', 'tasks.leaseTtlMs', 'not-a-number'], io), EXIT.GATE_FAIL);
  });
});

test('config set writes a valid value and persists it', async () => {
  await inTempRepo(async () => {
    const setIo = fakeIo();
    assert.equal(await configCommand.run(['set', 'tasks.complexityCheckpoint.enabled', 'false'], setIo), 0);
    const getIo = fakeIo();
    assert.equal(await configCommand.run(['get', 'tasks.complexityCheckpoint.enabled'], getIo), 0);
    assert.equal(getIo.outLines.join('\n').trim(), 'false');
  });
});
