import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openStore } from '../db/store.js';
import { addExecutionProfile } from '../gateway/profiles.js';
import { executionProfiles, roleProjectionReceipts } from '../gateway/schema.constants.js';
import { bootstrapBundledRoleCatalog } from './bundled-profile-bootstrap.js';
import { checkRoleSystem } from './system-check.js';

test('checkRoleSystem passes when no execution profiles exist (virgin path)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-system-check-no-profiles-'));
  const store = openStore(root);

  const result = await checkRoleSystem(store, root);

  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
  assert.equal(store.orm.select().from(executionProfiles).all().length, 0);
  assert.equal(store.orm.select().from(roleProjectionReceipts).all().length, 0);
  store.close();
});

test('checkRoleSystem returns charter/receipt violation when projection was never generated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-system-check-no-projection-'));
  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);

  const result = await checkRoleSystem(store, root);

  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes('ROLE_PROJECTION_RECEIPT_MISSING')));
  assert.equal(store.orm.select().from(roleProjectionReceipts).all().length, 0);
  store.close();
});

test('checkRoleSystem fails hard on incomplete execution profiles once env setup has started', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-system-check-one-profile-'));
  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);
  addExecutionProfile(store, {
    id: 'fake-impl', roleId: 'implementer', adapterId: 'fake', agentId: 'implementer',
    providerId: 'provider', modelId: 'model', adapterConfig: { endpoint: 'fake' },
    observationIntervalMs: 1, noProgressTimeoutMs: 60_000, cancellationGraceMs: 1,
    tools: { read: true }, enabled: true,
  });

  const result = await checkRoleSystem(store, root);

  assert.equal(result.valid, false);
  assert.ok(result.violations.length > 0);
  assert.ok(result.violations.some((v) => v.includes('no enabled execution profile')));
  store.close();
});
