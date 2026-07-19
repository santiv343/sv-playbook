import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command as restoreCommand } from './restore.js';

test('restore command declares a non-empty usage string', () => {
  assert.notEqual(restoreCommand.usage.trim(), '');
  assert.match(restoreCommand.usage, /^Usage: sv-playbook restore/);
});
