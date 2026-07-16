import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { openStore } from '../db/store.js';
import { addArtifactContract } from '../contracts/artifacts.js';
import { CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { addContextItem, loadContextCatalog, replaceContextPrecedence } from '../context/repository.js';
import { contextPrecedence } from '../context/schema.constants.js';
import {
  addModelCapability,
  addResponsibility,
  addRoleContract,
  checkRoleCatalog,
  listRoleCatalog,
  requireRole,
  setRolePolicy,
} from './catalog.js';
import { requireActiveRoleCatalog } from './catalog-activation.js';
import { BUNDLED_ROLE_CONTEXT_KIND, BUNDLED_ROLE_PROFILE } from './bundled-profile.constants.js';
import { bootstrapBundledRoleCatalog } from './bundled-profile-bootstrap.js';
import { artifactContracts } from '../orchestration/schema.constants.js';
import { digest } from '../context/digest.js';
import { REVIEW_CANDIDATE_CONTRACT_REF, REVIEW_CANDIDATE_SCHEMA } from '../review/review-candidate.constants.js';

function seedLegacyCatalog(store: ReturnType<typeof openStore>): void {
  replaceContextPrecedence(store, ['role']);
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
  } as const;
  addArtifactContract(store, { ref: 'legacy-envelope-v1', schema, status: 'active' });
  addModelCapability(store, { id: 'legacy-model', description: 'Legacy model floor.' });
  BUNDLED_ROLE_PROFILE.roles.forEach((role, index) => {
    const contextId = `LEGACY-ROLE-${index}`;
    const responsibilityId = `legacy.${role.id}`;
    addContextItem(store, {
      id: contextId,
      version: 1,
      kind: 'role',
      status: CONTEXT_ITEM_STATUS.ACTIVE,
      strength: CONTEXT_ITEM_STRENGTH.MANDATORY,
      semanticKey: `legacy.role.${role.id}`,
      body: `Legacy ${role.id}.`,
      provenance: 'legacy-test',
      selectors: { role: [role.id] },
    });
    addResponsibility(store, {
      id: responsibilityId,
      classification: 'semantic',
      description: `Legacy judgment for ${role.id}.`,
    });
    addRoleContract(store, {
      roleId: role.id,
      mission: `Legacy ${role.id}.`,
      contextItemRef: `${contextId}@1`,
      inputContractRef: 'legacy-envelope-v1',
      outputContractRef: 'legacy-envelope-v1',
      minimumModelCapability: 'legacy-model',
      exclusiveJudgments: [responsibilityId],
      capabilityRequestClasses: [],
    });
    setRolePolicy(store, {
      roleId: role.id,
      prohibitions: ['legacy.effect'],
      selfCorrectionMode: 'bounded',
      selfCorrectionScopes: ['legacy-envelope-v1'],
      stopConditions: ['legacy-stop'],
      escalationClasses: ['legacy-escalation'],
    });
    requireRole(store, role.id);
  });
}

test('bundled role bootstrap is reproducible, active, and idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-bundled-role-bootstrap-'));
  const store = openStore(root);

  const first = bootstrapBundledRoleCatalog(store);
  store.orm.delete(contextPrecedence).run();
  store.orm.update(artifactContracts).set({ schemaJson: '{}', schemaDigest: 'sha256:stale' })
    .where(eq(artifactContracts.ref, REVIEW_CANDIDATE_CONTRACT_REF)).run();
  const second = bootstrapBundledRoleCatalog(store);
  assert.deepEqual(second, first);
  assert.deepEqual(checkRoleCatalog(store), { valid: true, violations: [] });
  assert.equal(requireActiveRoleCatalog(store).catalogDigest, first.catalogDigest);
  const catalog = listRoleCatalog(store);
  assert.deepEqual(catalog.map((role) => role.roleId),
    [...BUNDLED_ROLE_PROFILE.roles].map((role) => role.id).sort());
  assert.equal(catalog.find((role) => role.roleId === BUNDLED_ROLE_PROFILE.entryRoleId)?.required, true);
  assert.equal(Number.isInteger(loadContextCatalog(store).precedence[BUNDLED_ROLE_CONTEXT_KIND]), true);
  const repaired = store.orm.select({ schemaDigest: artifactContracts.schemaDigest }).from(artifactContracts)
    .where(eq(artifactContracts.ref, REVIEW_CANDIDATE_CONTRACT_REF)).get();
  assert.equal(repaired?.schemaDigest, digest(REVIEW_CANDIDATE_SCHEMA));
  store.close();
});

test('bundled role bootstrap reconciles the exact legacy role set without manual cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-bundled-role-reconcile-'));
  const store = openStore(root);
  seedLegacyCatalog(store);

  const receipt = bootstrapBundledRoleCatalog(store);

  assert.equal(requireActiveRoleCatalog(store).catalogDigest, receipt.catalogDigest);
  assert.deepEqual(checkRoleCatalog(store), { valid: true, violations: [] });
  const catalog = listRoleCatalog(store);
  assert.deepEqual(catalog.map(({ roleId, mission, exclusiveJudgments }) => ({
    roleId,
    mission,
    exclusiveJudgments,
  })), [...BUNDLED_ROLE_PROFILE.roles]
    .map((role) => ({
      roleId: role.id,
      mission: role.mission,
      exclusiveJudgments: [role.exclusiveJudgment],
    }))
    .sort((left, right) => left.roleId.localeCompare(right.roleId)));
  assert.deepEqual(bootstrapBundledRoleCatalog(store), receipt);
  store.close();
});
