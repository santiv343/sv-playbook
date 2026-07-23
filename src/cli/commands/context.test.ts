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

test('context command declares a non-empty usage string', () => {
  assert.notEqual(command.usage.trim(), '');
  assert.match(command.usage, /^Usage:/);
  assert.match(command.usage, /sv-playbook context/);
});

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
      '--strength', 'mandatory', '--selector', 'role=implementer', '--capability', 'read=allow',
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

    const retiredIo = fakeIo();
    const retired = await command.run(['retire', '--id', 'P-1', '--version', '1'], retiredIo);
    assert.equal(retired, 0, retiredIo.errLines.join('\n'));
    assert.match(retiredIo.outLines.join('\n'), /retired context P-1@1/);

    const afterRetireIo = fakeIo();
    // El único ítem que otorgaba la capability 'read' está retirado — el
    // compile ahora falla cerrado (ninguna capability solicitada se cumple)
    // en vez de compilar silenciosamente sin él. El receipt sí sigue
    // mencionando P-1@1, pero excluido con reason "inactive" — la
    // constancia de que existió, no una inclusión activa.
    const afterRetire = await command.run([
      'compile', '--role', 'implementer', '--phase', 'delivery', '--capability', 'read',
    ], afterRetireIo);
    assert.equal(afterRetire, 1);
    const afterRetireResult: unknown = JSON.parse(afterRetireIo.outLines.join('\n'));
    assert.deepEqual(afterRetireResult && typeof afterRetireResult === 'object' ? Reflect.get(afterRetireResult, 'items') : undefined, []);
  } finally {
    process.chdir(previous);
  }
});
