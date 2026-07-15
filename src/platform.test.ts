import assert from 'node:assert/strict';
import test from 'node:test';
import { nodeErrorCode } from './platform.js';

test('nodeErrorCode reads typed process errors without unsafe casting', () => {
  assert.equal(nodeErrorCode(Object.assign(new Error('failure'), { code: 'ENOBUFS' })), 'ENOBUFS');
  assert.equal(nodeErrorCode(new Error('failure')), undefined);
  assert.equal(nodeErrorCode(null), undefined);
});
