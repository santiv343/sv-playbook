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

test('gap analysis reports present artifacts with correct reasons', () => {
  const inventory: InventoryReport = {
    stack: ['node', 'typescript'],
    verifyCommand: 'npm run verify',
    ci: { workflows: [] },
    playbookArtifacts: {
      'playbook.config.json': true,
      'AGENTS.md': true,
      'docs/packets/': true,
    },
    git: { remoteUrl: 'git@github.com:org/repo.git', defaultBranch: 'main' },
    packages: [],
  };

  const report = analyzeGaps(inventory);

  const agentsMd = report.checks.find(c => c.requirement === 'AGENTS.md');
  const config = report.checks.find(c => c.requirement === 'playbook.config.json');
  const verify = report.checks.find(c => c.requirement === 'verify command');
  const packets = report.checks.find(c => c.requirement === 'docs/packets/');
  const ci = report.checks.find(c => c.requirement === 'CI workflow');

  assert.ok(agentsMd);
  assert.equal(agentsMd.status, 'present');
  assert.ok(!agentsMd.reason.includes('missing'), 'present reason should not say missing');
  assert.ok(config);
  assert.equal(config.status, 'present');
  assert.ok(!config.reason.includes('missing'), 'present reason should not say missing');
  assert.ok(verify);
  assert.equal(verify.status, 'present');
  assert.ok(verify.reason.includes('npm run verify'));
  assert.ok(packets);
  assert.equal(packets.status, 'present');
  assert.ok(ci);
  assert.equal(ci.status, 'missing');
});

test('gap analysis sorts missing before present', () => {
  const inventory: InventoryReport = {
    stack: ['node'],
    verifyCommand: null,
    ci: { workflows: [] },
    playbookArtifacts: {
      'playbook.config.json': true,
      'AGENTS.md': false,
    },
    git: { remoteUrl: '', defaultBranch: '' },
    packages: [],
  };

  const report = analyzeGaps(inventory);
  const missingIdx = report.checks.findIndex(c => c.status === 'missing');
  const presentIdx = report.checks.findIndex(c => c.status === 'present');

  assert.ok(missingIdx >= 0, 'should have at least one missing gap');
  assert.ok(presentIdx >= 0, 'should have at least one present gap');
  assert.ok(missingIdx < presentIdx, 'missing gaps should appear before present gaps');
});
