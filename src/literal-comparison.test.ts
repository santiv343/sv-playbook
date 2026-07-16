import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  evaluateLiteralComparisonBaseline,
  inspectLiteralComparisons,
  inspectLiteralComparisonTree,
} from './check/literal-comparison.js';
import { LITERAL_COMPARISON_KIND } from './check/literal-comparison.constants.js';
import { SOURCE_BASELINE_STATUS } from './check/source-baseline.constants.js';
import { loadConfig } from './config.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

test('numeric comparisons against literals are detected structurally', () => {
  const violations = inspectLiteralComparisons({
    path: 'src/example.ts',
    source: `if (statusCode === 204) return;\nswitch (version) { case 2: break; }`,
  });
  assert.deepEqual(violations.map(({ kind, line, path }) => ({ kind, line, path })), [
    { kind: LITERAL_COMPARISON_KIND.NUMBER, line: 1, path: 'src/example.ts' },
    { kind: LITERAL_COMPARISON_KIND.NUMBER, line: 2, path: 'src/example.ts' },
  ]);
});

test('named numeric constants are not reported', () => {
  assert.deepEqual(inspectLiteralComparisons({
    path: 'src/example.ts',
    source: `if (statusCode === HTTP_STATUS.NO_CONTENT) return;`,
  }), []);
});

test('numeric literal comparison debt matches an exact, monotonically decreasing baseline', () => {
  const inventory = inspectLiteralComparisonTree(REPO_ROOT);
  const evaluation = evaluateLiteralComparisonBaseline(
    inventory,
    loadConfig(REPO_ROOT).baseline?.literalComparisons,
  );
  const detail = inventory.violations
    .map((item) => `${item.path}:${item.line}:${item.column} ${item.kind}`)
    .join('\n');
  assert.equal(evaluation.status, SOURCE_BASELINE_STATUS.MATCH, `${evaluation.message}\n${detail}`);
});
