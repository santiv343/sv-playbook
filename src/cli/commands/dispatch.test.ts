import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import type { Io } from '../command.types.js';
import { gatewayFixture } from '../../gateway/gateway.test-support.js';
import { prepareRunSpec } from '../../gateway/run-spec.js';
import { command } from './dispatch.js';
import { EXIT } from '../command.constants.js';
import { REFERENCE_KIND } from '../../platform.constants.js';
import { WORK_DEFINITION_INITIAL_VERSION } from '../../tasks/work-definition.constants.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (line) => { outLines.push(line); }, err: (line) => { errLines.push(line); } };
}

test('CLI preparation resolves the typed work definition through the shared runtime capability', async () => {
  const { root, store } = await gatewayFixture();
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  const expected = prepareRunSpec(store, {
    roleId: 'implementer', phase: 'delivery',
    workDefinitionRef: {
      kind: REFERENCE_KIND.WORK_DEFINITION,
      id: 'TASK-1',
      version: WORK_DEFINITION_INITIAL_VERSION,
    },
    executionProfileId: 'fake-impl',
  });
  store.close();
  const io = fakeIo();
  const previous = process.cwd();
  process.chdir(root);
  try {
    const exitCode = await command.run([
      'prepare', '--role', 'implementer', '--phase', 'delivery', '--task', 'TASK-1@1', '--profile', 'fake-impl',
    ], io);
    assert.equal(exitCode, EXIT.OK, io.errLines.join('\n'));
    const actual: unknown = JSON.parse(io.outLines.join('\n'));
    assert.equal(typeof actual === 'object' && actual !== null ? Reflect.get(actual, 'specDigest') : undefined, expected.specDigest);
    assert.equal(typeof actual === 'object' && actual !== null ? Reflect.get(actual, 'id') : undefined, expected.id);
  } finally {
    process.chdir(previous);
  }
});
