import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command as executionProfileCommand } from './execution-profile.js';

test('execution-profile command declares a non-empty usage string', () => {
  assert.notEqual(executionProfileCommand.usage.trim(), '');
  assert.match(executionProfileCommand.usage, /^Usage: sv-playbook execution-profile/);
});
