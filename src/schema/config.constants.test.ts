import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaybookConfig } from './config.constants.js';

test('TasksConfigSchema accepts a complexityCheckpoint block with defaults', () => {
  const parsed = parsePlaybookConfig(
    JSON.stringify({
      tasks: {
        leaseTtlMs: 1800000,
        complexityCheckpoint: {
          enabled: true,
          requireDecisionForTypes: [],
          requireDecisionForPaths: [],
        },
      },
    }),
  );
  const tasks = parsed.tasks as Record<string, unknown>;
  const checkpoint = tasks.complexityCheckpoint as { enabled: boolean };
  assert.equal(checkpoint.enabled, true);
});
