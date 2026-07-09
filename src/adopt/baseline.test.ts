import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkViolation } from './baseline.js';

test('a baselined violation is grandfathered while a new one fails', () => {
  const baseline = { fingerprints: ['X'] };
  assert.equal(checkViolation('X', baseline), 'grandfathered');
  assert.equal(checkViolation('Y', baseline), 'failing');
});
