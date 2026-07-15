import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  evaluateDuplicateStringBaseline,
  inspectDuplicateStrings,
  inspectDuplicateStringTree,
} from './duplicate-string.js';
import { SOURCE_BASELINE_STATUS } from './source-baseline.constants.js';
import { loadConfig } from '../config.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('duplicate string literals are detected across production files', () => {
  const inventory = inspectDuplicateStrings([
    { path: 'src/first.ts', source: `export const first = 'shared-value';` },
    { path: 'src/second.ts', source: `export const second = 'shared-value';` },
  ]);

  assert.equal(inventory.count, 1);
  assert.deepEqual(inventory.violations.map(({ path, line, value }) => ({ path, line, value })), [{
    path: 'src/second.ts',
    line: 1,
    value: 'shared-value',
  }]);
});

test('constant references do not duplicate their string value', () => {
  const inventory = inspectDuplicateStrings([
    { path: 'src/status.constants.ts', source: `export const STATUS = { READY: 'ready' } as const;` },
    { path: 'src/use.ts', source: `import { STATUS } from './status.constants.js';\nexport const value = STATUS.READY;` },
  ]);

  assert.equal(inventory.count, 0);
});

test('syntax-only strings and test fixtures are outside the production inventory', () => {
  const inventory = inspectDuplicateStrings([
    {
      path: 'src/first.ts',
      source: `import value from 'shared-package';\nexport type State = 'ready';\nexport const item = { 'label': value };`,
    },
    {
      path: 'src/second.ts',
      source: `export { value } from 'shared-package';\nexport type OtherState = 'ready';\nexport const item = { 'label': true };`,
    },
    { path: 'src/example.test.ts', source: `const first = 'fixture'; const second = 'fixture';` },
  ]);

  assert.equal(inventory.count, 0);
});

test('cross-file duplicate string debt matches the repository baseline', () => {
  const inventory = inspectDuplicateStringTree(REPO_ROOT);
  const evaluation = evaluateDuplicateStringBaseline(
    inventory,
    loadConfig(REPO_ROOT).baseline?.duplicateStrings,
  );
  const detail = inventory.violations
    .map((item) => `${item.path}:${item.line}:${item.column} ${JSON.stringify(item.value)}`)
    .join('\n');

  assert.equal(evaluation.status, SOURCE_BASELINE_STATUS.MATCH, `${evaluation.message}\n${detail}`);
});
