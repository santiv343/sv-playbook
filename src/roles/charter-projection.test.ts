import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { gatewayFixture } from '../gateway/gateway.test-support.js';
import { promoteRoleProjections } from '../gateway/adapters/role-projection-registry.js';
import { requireActiveRoleCatalog } from './catalog-activation.js';
import {
  compileRoleCharterProjection,
  inspectRoleCharterProjection,
} from './charter-projection.js';

test('generated role charters carry the active version and digest and fail closed on drift', async () => {
  const { root, store } = await gatewayFixture();
  const active = requireActiveRoleCatalog(store);
  const candidate = compileRoleCharterProjection(store, root);

  assert.match(candidate.artifacts[0]?.content ?? '', new RegExp(String(active.version)));
  assert.match(candidate.artifacts[0]?.content ?? '', new RegExp(active.catalogDigest));
  assert.equal(promoteRoleProjections(store, [candidate]).length, 1);
  assert.deepEqual(inspectRoleCharterProjection(store, root), { valid: true, violations: [] });

  const artifact = candidate.artifacts[0];
  assert.notEqual(artifact, undefined);
  writeFileSync(artifact?.targetPath ?? '', `${artifact?.content ?? ''}\nmanual drift`, 'utf8');
  const drift = inspectRoleCharterProjection(store, root);
  assert.equal(drift.valid, false);
  assert.equal(drift.violations.length, 1);
  store.close();
});
