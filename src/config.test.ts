import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';

test('loadConfig returns defaults when the file is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  const config = loadConfig(dir);
  assert.deepEqual(config, {
    productName: 'unnamed',
    chatLanguage: 'en',
    tier: 'TIER-2',
    verifyCommand: 'npm run verify',
    autonomy: 'strict',
    maxConcurrentWorkers: 3,
    reviewCandidateMaxBytes: 16 * 1024 * 1024,
    reviewPreflight: {
      preparationCommand: '',
      noOutputTimeoutMs: 600_000,
    },
    backup: {
      enabled: true,
      retention: 20,
      maxAgeHours: 6,
      onEvents: ['done', 'force-takeover', 'restore', 'schema-mismatch'],
    },
    modelEvaluation: {
      evidenceValidityDays: 30,
    },
    gates: {
      maxLines: 350,
      maxLinesPerFunction: 60,
      complexity: 10,
      cognitiveComplexity: 10,
      layout: true,
    },
  });
});

test('loadConfig reads a valid config file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({
    productName: 'My App',
    chatLanguage: 'es',
    tier: 'TIER-1',
    verifyCommand: 'npm run check',
    autonomy: 'high',
    reviewCandidateMaxBytes: 8 * 1024 * 1024,
    reviewPreflight: {
      preparationCommand: 'npm ci',
      noOutputTimeoutMs: 1_234,
    },
    backup: {
      enabled: false,
      retention: 3,
      maxAgeHours: 12,
      onEvents: ['done'],
    },
    modelEvaluation: {
      evidenceValidityDays: 45,
    },
  }));
  const config = loadConfig(dir);
  assert.deepEqual(config, {
    productName: 'My App',
    chatLanguage: 'es',
    tier: 'TIER-1',
    verifyCommand: 'npm run check',
    autonomy: 'high',
    maxConcurrentWorkers: 3,
    reviewCandidateMaxBytes: 8 * 1024 * 1024,
    reviewPreflight: {
      preparationCommand: 'npm ci',
      noOutputTimeoutMs: 1_234,
    },
    backup: {
      enabled: false,
      retention: 3,
      maxAgeHours: 12,
      onEvents: ['done'],
    },
    modelEvaluation: {
      evidenceValidityDays: 45,
    },
    gates: {
      maxLines: 350,
      maxLinesPerFunction: 60,
      complexity: 10,
      cognitiveComplexity: 10,
      layout: true,
    },
  });
});

test('loadConfig ignores extra fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({
    productName: 'App',
    extraField: 'should be ignored',
  }));
  const config = loadConfig(dir);
  assert.equal(config.productName, 'App');
});

test('loadConfig throws ConfigError for invalid tier value', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({
    tier: 'TIER-5',
  }));
  assert.throws(() => loadConfig(dir), { name: 'ConfigError', message: /tier/ });
});

test('loadConfig throws ConfigError for malformed JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), '{ invalid json }');
  assert.throws(() => loadConfig(dir), { name: 'ConfigError', message: /malformed JSON/ });
});

test('loadConfig throws ConfigError for invalid backup event', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({
    backup: { onEvents: ['surprise'] },
  }));
  assert.throws(() => loadConfig(dir), { name: 'ConfigError', message: /backup.onEvents/ });
});

test('config defaults maxConcurrentWorkers and rejects a non-positive value', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  const config = loadConfig(dir);
  assert.equal(config.maxConcurrentWorkers, 3);

  const dir2 = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir2, 'playbook.config.json'), JSON.stringify({
    maxConcurrentWorkers: 0,
  }));
  assert.throws(() => loadConfig(dir2), { name: 'ConfigError' });

  const dir3 = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir3, 'playbook.config.json'), JSON.stringify({
    maxConcurrentWorkers: 1.5,
  }));
  assert.throws(() => loadConfig(dir3), { name: 'ConfigError' });
});

test('config accepts a valid custom maxConcurrentWorkers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({
    maxConcurrentWorkers: 5,
  }));
  const config = loadConfig(dir);
  assert.equal(config.maxConcurrentWorkers, 5);
});

test('config rejects negative maxConcurrentWorkers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({
    maxConcurrentWorkers: -1,
  }));
  assert.throws(() => loadConfig(dir), { name: 'ConfigError' });
});

test('config rejects non-numeric maxConcurrentWorkers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({
    maxConcurrentWorkers: 'three',
  }));
  assert.throws(() => loadConfig(dir), { name: 'ConfigError' });
});

test('config rejects a non-positive reviewCandidateMaxBytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({
    reviewCandidateMaxBytes: 0,
  }));
  assert.throws(() => loadConfig(dir), { name: 'ConfigError', message: /reviewCandidateMaxBytes/ });
});

test('gate thresholds and the layout rule come from config, not hardcoded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  const config = loadConfig(dir);
  assert.ok(config.gates, 'gates section should exist');
  assert.equal(config.gates.maxLines, 350);
  assert.equal(config.gates.maxLinesPerFunction, 60);
  assert.equal(config.gates.complexity, 10);
  assert.equal(config.gates.cognitiveComplexity, 10);
  assert.equal(config.gates.layout, true);

  const dir2 = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(dir2, 'playbook.config.json'), JSON.stringify({
    gates: { maxLines: 200, layout: false },
  }));
  const config2 = loadConfig(dir2);
  assert.equal(config2.gates.maxLines, 200);
  assert.equal(config2.gates.maxLinesPerFunction, 60);
  assert.equal(config2.gates.complexity, 10);
  assert.equal(config2.gates.cognitiveComplexity, 10);
  assert.equal(config2.gates.layout, false);
});

test('source debt baselines are validated as non-negative counts and SHA-256 digests', () => {
  const validDir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(validDir, 'playbook.config.json'), JSON.stringify({
    baseline: {
      ormApplicationSql: { count: 0, digest: 'a'.repeat(64) },
      literalComparisons: { count: 0, digest: 'b'.repeat(64) },
      duplicateStrings: { count: 0, digest: 'c'.repeat(64) },
    },
  }));
  assert.deepEqual(loadConfig(validDir).baseline?.ormApplicationSql, {
    count: 0,
    digest: 'a'.repeat(64),
  });
  assert.deepEqual(loadConfig(validDir).baseline?.literalComparisons, {
    count: 0,
    digest: 'b'.repeat(64),
  });
  assert.deepEqual(loadConfig(validDir).baseline?.duplicateStrings, {
    count: 0,
    digest: 'c'.repeat(64),
  });

  const invalidCountDir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(invalidCountDir, 'playbook.config.json'), JSON.stringify({
    baseline: { ormApplicationSql: { count: -1, digest: 'a'.repeat(64) } },
  }));
  assert.throws(() => loadConfig(invalidCountDir), { name: 'ConfigError', message: /non-negative/ });

  const invalidDigestDir = mkdtempSync(join(tmpdir(), 'svp-config-'));
  writeFileSync(join(invalidDigestDir, 'playbook.config.json'), JSON.stringify({
    baseline: { ormApplicationSql: { count: 0, digest: 'not-a-digest' } },
  }));
  assert.throws(() => loadConfig(invalidDigestDir), { name: 'ConfigError', message: /SHA-256/ });
});
