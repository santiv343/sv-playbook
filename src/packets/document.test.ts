import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePacketDocument, parsePacketDocument } from './document.js';
import { PacketFormatError } from './document.errors.js';

const def = {
  id: 'PACKET-001',
  title: 'Example packet',
  dependsOn: [],
  writeSet: ['src/x/**'],
  requirements: ['REQ-001'],
  evidenceRequired: ['red-test-output', 'verify-root', 'final-sha'],
};

test('generate/parse round-trip is lossless', () => {
  const text = generatePacketDocument(def, 'Do the thing.\n');
  const back = parsePacketDocument(text);
  assert.deepEqual(back.definition, def);
  assert.equal(back.body, 'Do the thing.\n');
});

test('parse rejects missing required keys', () => {
  assert.throws(() => parsePacketDocument('---\nid: X-1\n---\nbody'), PacketFormatError);
});

test('generate rejects invalid id and empty write_set', () => {
  assert.throws(() => generatePacketDocument({ ...def, id: 'lower-case' }, 'b'), PacketFormatError);
  assert.throws(() => generatePacketDocument({ ...def, writeSet: [] }, 'b'), PacketFormatError);
});
