import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gatewayFixture } from '../gateway/gateway.test-support.js';
import { ROLE_CATALOG_ERROR } from './catalog.constants.js';
import {
  addModelCapabilityEvidence,
  checkModelCapabilityEvidence,
} from './model-capability-evidence.js';

const ASSESSED_AT = '2026-01-01T00:00:00.000Z';
const EXPIRED_AT = '2026-02-01T00:00:00.000Z';
const CHECKED_AT = new Date('2026-03-01T00:00:00.000Z');
const CURRENT_UNTIL = '2027-01-01T00:00:00.000Z';
const EXPIRED_EVIDENCE_DIGEST = `sha256:${'1'.repeat(64)}`;
const CURRENT_EVIDENCE_DIGEST = `sha256:${'2'.repeat(64)}`;

test('model capability evidence is bound to model identity and expires mechanically', async () => {
  const { store } = await gatewayFixture({ activateCatalog: false, seedModelEvidence: false });

  const missing = checkModelCapabilityEvidence(store, CHECKED_AT);
  assert.equal(missing.violations[0]?.startsWith(ROLE_CATALOG_ERROR.MODEL_EVIDENCE_MISSING), true);

  addModelCapabilityEvidence(store, {
    providerId: 'provider', modelId: 'model', capabilityId: 'implementation',
    evidenceRef: 'evaluation:expired', evidenceDigest: EXPIRED_EVIDENCE_DIGEST,
    assessedAt: ASSESSED_AT, expiresAt: EXPIRED_AT,
  });
  const expired = checkModelCapabilityEvidence(store, CHECKED_AT);
  assert.equal(expired.violations[0]?.startsWith(ROLE_CATALOG_ERROR.MODEL_EVIDENCE_NOT_CURRENT), true);

  addModelCapabilityEvidence(store, {
    providerId: 'provider', modelId: 'model', capabilityId: 'implementation',
    evidenceRef: 'evaluation:current', evidenceDigest: CURRENT_EVIDENCE_DIGEST,
    assessedAt: ASSESSED_AT, expiresAt: CURRENT_UNTIL,
  });
  assert.deepEqual(checkModelCapabilityEvidence(store, CHECKED_AT), { valid: true, violations: [] });
  store.close();
});
