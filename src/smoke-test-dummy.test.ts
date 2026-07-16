import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smokeTestDummy } from './smoke-test-dummy.js';

test('smokeTestDummy returns 42', () => {
  assert.equal(smokeTestDummy(), 42);
});
