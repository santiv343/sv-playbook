import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import { ContextError } from '../context/context.errors.js';
import { addArtifactContract, resolvedArtifactSchema, validateArtifact } from './artifacts.js';
import { ARTIFACT_CONTRACT_ERROR } from './artifact.constants.js';

test('artifact contracts compile strictly and validate structured handoffs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-contracts-'));
  const store = openStore(root);
  addArtifactContract(store, {
    ref: 'implementation-report-v1', status: 'active',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object', additionalProperties: false, required: ['status'],
      properties: { status: { enum: ['complete', 'blocked'] } },
    },
  });
  validateArtifact(store, 'implementation-report-v1', { status: 'complete' });
  assert.throws(
    () => { validateArtifact(store, 'implementation-report-v1', { status: 'invented' }); },
    (error: unknown) => error instanceof ContextError && error.code === ARTIFACT_CONTRACT_ERROR.CONTRACT_VIOLATION,
  );
  store.close();
});

test('artifact validation resolves references through the active contract catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-contract-refs-'));
  const store = openStore(root);
  addArtifactContract(store, {
    ref: 'urn:test:shared', status: 'active',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:test:shared',
      $defs: { evidence: { type: 'object', required: ['source'], properties: { source: { type: 'string' } } } },
    },
  });
  addArtifactContract(store, {
    ref: 'report-v1', status: 'active',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['evidence'],
      properties: { evidence: { $ref: 'urn:test:shared#/$defs/evidence' } },
    },
  });
  validateArtifact(store, 'report-v1', { evidence: { source: 'test' } });
  const resolved = resolvedArtifactSchema(store, 'report-v1');
  assert.deepEqual(resolved.properties, { evidence: { $ref: '#/$defs/evidence' } });
  assert.deepEqual(resolved.$defs, {
    evidence: { type: 'object', required: ['source'], properties: { source: { type: 'string' } } },
  });
  assert.throws(
    () => { validateArtifact(store, 'report-v1', { evidence: {} }); },
    (error: unknown) => error instanceof ContextError && error.code === ARTIFACT_CONTRACT_ERROR.CONTRACT_VIOLATION,
  );
  store.close();
});
