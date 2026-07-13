import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkViolation } from './baseline.js';

test('a baselined fingerprint is grandfathered while an unknown one fails', () => {
  const baseline = { fingerprints: ['docs/packets/OLD-001.md'] };
  assert.equal(checkViolation('docs/packets/OLD-001.md', baseline), 'grandfathered');
  assert.equal(checkViolation('docs/packets/NEW-001.md', baseline), 'failing');
});

test('undefined baseline treats every packet as failing', () => {
  assert.equal(checkViolation('docs/packets/X.md', undefined), 'failing');
});

test('empty fingerprints baseline treats every packet as failing', () => {
  const baseline = { fingerprints: [] };
  assert.equal(checkViolation('docs/packets/X.md', baseline), 'failing');
});
