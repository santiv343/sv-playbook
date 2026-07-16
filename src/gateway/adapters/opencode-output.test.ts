import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileOpenCodeOutput } from './opencode-output.js';

function response(id: string, parentID: string, finish: string | undefined, parts: readonly unknown[]): unknown {
  return { info: { id, role: 'assistant', parentID, finish }, parts };
}

test('OpenCode output reconciliation accepts one correlated terminal text response', () => {
  assert.deepEqual(reconcileOpenCodeOutput([
    { info: { id: 'user', role: 'user' }, parts: [] },
    response('assistant-1', 'user', 'stop', [{ type: 'text', text: '{"ok":true}' }]),
  ], 'user'), {
    status: 'accepted', responseMessageIds: ['assistant-1'], rawText: '{"ok":true}', violations: [],
  });
});

test('OpenCode output reconciliation rejects tools and duplicate responses without choosing one', () => {
  assert.equal(reconcileOpenCodeOutput([
    response('assistant-1', 'user', 'stop', [{ type: 'tool' }]),
  ], 'user').status, 'rejected');
  assert.deepEqual(reconcileOpenCodeOutput([
    response('assistant-1', 'user', 'stop', [{ type: 'text', text: 'first' }]),
    response('assistant-2', 'user', 'stop', [{ type: 'text', text: 'second' }]),
  ], 'user'), {
    status: 'ambiguous', responseMessageIds: ['assistant-1', 'assistant-2'],
    violations: ['expected one assistant response, observed 2'],
  });
});
