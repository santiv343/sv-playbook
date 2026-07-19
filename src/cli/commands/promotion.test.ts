import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command as promotionCommand } from './promotion.js';

test('promotion command declares a non-empty usage string', () => {
  assert.notEqual(promotionCommand.usage.trim(), '');
  assert.match(promotionCommand.usage, /^Usage:\n\s+sv-playbook promotion/);
});
