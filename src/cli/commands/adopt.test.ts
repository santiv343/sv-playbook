import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { main } from '../main.js';
import type { Io } from '../command.types.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempBareRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-adopt-'));
  execFileSync('git', ['init'], { cwd: root });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'test-app', scripts: { test: 'echo ok' } }),
    'utf8',
  );
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

test('adopt scaffolds config, AGENTS.md and remediation packets for a bare repo', async () => {
  await inTempBareRepo(async () => {
    const io = fakeIo();
    await main(['adopt'], io);

    assert.ok(existsSync('playbook.config.json'), 'playbook.config.json should exist after adopt');
    assert.ok(existsSync('AGENTS.md'), 'AGENTS.md should exist after adopt');
    assert.ok(existsSync(join('docs', 'packets')), 'docs/packets directory should exist after adopt');
  });
});
