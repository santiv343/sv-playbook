import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceInventoryDigest } from './source-fingerprint.js';

test('source inventory digest is order-independent and multiplicity-sensitive', () => {
  const forward = sourceInventoryDigest(['fingerprint-a', 'fingerprint-b']);
  const reversed = sourceInventoryDigest(['fingerprint-b', 'fingerprint-a']);
  const duplicated = sourceInventoryDigest(['fingerprint-a', 'fingerprint-b', 'fingerprint-b']);

  assert.equal(forward, reversed);
  assert.notEqual(forward, duplicated);
});
