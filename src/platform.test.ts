import assert from 'node:assert/strict';
import test from 'node:test';
import { detachProcessTree, nodeErrorCode } from './platform.js';
import { OS_PLATFORM } from './platform.constants.js';

test('nodeErrorCode reads typed process errors without unsafe casting', () => {
  assert.equal(nodeErrorCode(Object.assign(new Error('failure'), { code: 'ENOBUFS' })), 'ENOBUFS');
  assert.equal(nodeErrorCode(new Error('failure')), undefined);
  assert.equal(nodeErrorCode(null), undefined);
});

test('process-tree detachment is selected by the platform adapter', () => {
  assert.equal(detachProcessTree(), process.platform !== OS_PLATFORM.WINDOWS);
});
