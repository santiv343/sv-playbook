import { test } from 'node:test';
import assert from 'node:assert/strict';
import { e2eDummy } from './e2e-dummy.js';

test('e2eDummy returns 42', () => {
  assert.equal(e2eDummy(), 42);
});
