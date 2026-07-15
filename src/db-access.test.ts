import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { inspectOrmBoundaryTree, evaluateOrmBoundaryBaseline } from './check/orm-boundary.js';
import { SOURCE_BASELINE_STATUS } from './check/source-baseline.constants.js';
import { loadConfig } from './config.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

test('application persistence matches the monotonically decreasing ORM debt baseline', () => {
  const inventory = inspectOrmBoundaryTree(REPO_ROOT);
  const evaluation = evaluateOrmBoundaryBaseline(
    inventory,
    loadConfig(REPO_ROOT).baseline?.ormApplicationSql,
  );
  const detail = inventory.violations
    .map((item) => `${item.path}:${item.line}:${item.column} ${item.kind}`)
    .join('\n');
  assert.equal(evaluation.status, SOURCE_BASELINE_STATUS.MATCH, `${evaluation.message}\n${detail}`);
});
