import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './context.js';
import type { Io } from '../command.types.js';
import { initTestRepo } from '../../testkit.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (line) => { outLines.push(line); }, err: (line) => { errLines.push(line); } };
}

test('context CLI persists canonical content and compiles a role-scoped pack', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-context-cli-'));
  initTestRepo(root);
  const bodyPath = join(root, 'body.txt');
  await writeFile(bodyPath, 'Runtime owns deterministic work.');
  const previous = process.cwd();
  process.chdir(root);
  try {
    const precedenceIo = fakeIo();
    assert.equal(await command.run(['precedence', 'principle'], precedenceIo), 0);
    const addedIo = fakeIo();
    const added = await command.run([
      'add', '--id', 'P-1', '--version', '1', '--kind', 'principle',
      '--semantic-key', 'determinism', '--body-file', bodyPath, '--provenance', 'test',
      '--selector', 'role=implementer', '--capability', 'read=allow',
    ], addedIo);
    assert.equal(added, 0, addedIo.errLines.join('\n'));

    const compiledIo = fakeIo();
    const compiled = await command.run([
      'compile', '--role', 'implementer', '--phase', 'delivery', '--capability', 'read',
    ], compiledIo);
    assert.equal(compiled, 0, compiledIo.errLines.join('\n'));
    const result: unknown = JSON.parse(compiledIo.outLines.join('\n'));
    assert.equal(typeof result, 'object');
    assert.match(compiledIo.outLines.join('\n'), /P-1@1/);
  } finally {
    process.chdir(previous);
  }
});
