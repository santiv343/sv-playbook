import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command as reviewCommand } from './review.js';

test('review command declares a non-empty usage string', () => {
  assert.notEqual(reviewCommand.usage.trim(), '');
  assert.match(reviewCommand.usage, /^Usage: sv-playbook review/);
});
