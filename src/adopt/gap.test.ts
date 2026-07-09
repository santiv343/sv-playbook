import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGaps } from './gap.js';
import type { InventoryReport } from './inventory.types.js';

test('gap analysis flags missing AGENTS.md and missing config as gaps', () => {
  const inventory: InventoryReport = {
    stack: ['node', 'typescript'],
    verifyCommand: 'npm test',
    ci: { workflows: ['.github/workflows/ci.yml'] },
    playbookArtifacts: {
      'playbook.config.json': false,
      'AGENTS.md': false,
    },
    git: { remoteUrl: 'git@github.com:org/repo.git', defaultBranch: 'main' },
    packages: [],
  };

  const report = analyzeGaps(inventory);

  const agentsMd = report.checks.find(c => c.requirement === 'AGENTS.md');
  const config = report.checks.find(c => c.requirement === 'playbook.config.json');

  assert.ok(agentsMd, 'AGENTS.md check should exist');
  assert.equal(agentsMd.status, 'missing');
  assert.ok(config, 'playbook.config.json check should exist');
  assert.equal(config.status, 'missing');
});
