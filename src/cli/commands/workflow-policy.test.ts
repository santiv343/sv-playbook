import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command as workflowPolicyCommand } from './workflow-policy.js';

test('workflow-policy command declares a non-empty usage string', () => {
  assert.notEqual(workflowPolicyCommand.usage.trim(), '');
  assert.match(workflowPolicyCommand.usage, /^Usage: sv-playbook workflow-policy/);
});
