import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_USAGE_VIOLATION_KIND } from './command-usage.constants.js';
import { inspectCommandUsage } from './command-usage.js';

const missingUsageViolation = (commandName: string) => ({
  kind: COMMAND_USAGE_VIOLATION_KIND.MISSING,
  commandName,
});

test('flags a command with an empty usage string', () => {
  const violations = inspectCommandUsage([
    { name: 'broken', summary: 's', usage: '', run: () => Promise.resolve(0) },
  ]);
  assert.deepEqual(violations, [missingUsageViolation('broken')]);
});

test('flags a command with a whitespace-only usage string', () => {
  const violations = inspectCommandUsage([
    { name: 'whitespace', summary: 's', usage: '   ', run: () => Promise.resolve(0) },
  ]);
  assert.deepEqual(violations, [missingUsageViolation('whitespace')]);
});

test('passes a command with a non-empty usage string', () => {
  const violations = inspectCommandUsage([
    { name: 'ok', summary: 's', usage: 'sv-playbook ok [--flag]', run: () => Promise.resolve(0) },
  ]);
  assert.deepEqual(violations, []);
});

test('returns only the violations from a mixed command list', () => {
  const violations = inspectCommandUsage([
    { name: 'ok', summary: 's', usage: 'sv-playbook ok [--flag]', run: () => Promise.resolve(0) },
    { name: 'broken', summary: 's', usage: '', run: () => Promise.resolve(0) },
  ]);
  assert.deepEqual(violations, [missingUsageViolation('broken')]);
});
