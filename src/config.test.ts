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
    enforceVerifyOnReview: true,
    autonomy: 'strict',
    backup: {
      enabled: true,
      retention: 20,
      maxAgeHours: 6,
      onEvents: ['done', 'force-takeover', 'restore', 'schema-mismatch'],
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
    backup: {
      enabled: false,
      retention: 3,
      maxAgeHours: 12,
      onEvents: ['done'],
    },
  }));
  const config = loadConfig(dir);
  assert.deepEqual(config, {
    productName: 'My App',
    chatLanguage: 'es',
    tier: 'TIER-1',
    verifyCommand: 'npm run check',
    enforceVerifyOnReview: true,
    autonomy: 'high',
    backup: {
      enabled: false,
      retention: 3,
      maxAgeHours: 12,
      onEvents: ['done'],
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
