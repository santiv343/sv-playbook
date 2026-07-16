import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import { CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { ContextError } from '../context/context.errors.js';
import { addContextItem, replaceContextPrecedence } from '../context/repository.js';
import { addArtifactContract } from '../contracts/artifacts.js';
import { ROLE_CATALOG_ERROR } from './catalog.constants.js';
import {
  addModelCapability,
  addResponsibility,
  addRoleContract,
  addRoleHandoff,
  checkRoleCatalog,
  listRoleCatalog,
  requireRole,
  setRoleContract,
  setRoleCatalogProfile,
  setRolePolicy,
} from './catalog.js';
import { activateRoleCatalog, checkActiveRoleCatalog, requireActiveRoleCatalog } from './catalog-activation.js';
import { ROLE_CATALOG_INITIAL_VERSION, ROLE_CATALOG_VERSION_INCREMENT } from './catalog-activation.constants.js';
import { ROLE_DEFINITION_VERSION_INCREMENT } from './role.constants.js';
import { ROLE_CATALOG_PROFILE_SOURCE } from './catalog.constants.js';

const REVIEWER_ROLE_ID = 'reviewer';

test('role catalog assigns semantic judgment once and rejects deterministic ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-roles-'));
  const store = openStore(root);
  replaceContextPrecedence(store, ['role']);
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
  } as const;
  for (const ref of ['task-contract-v1', 'implementation-report-v1']) {
    addArtifactContract(store, { ref, schema, status: 'active' });
  }
  addModelCapability(store, { id: 'implementation', description: 'Can design and materialize a bounded candidate.' });
  addModelCapability(store, { id: 'review', description: 'Can independently evaluate a bounded candidate.' });
  addContextItem(store, {
    id: 'ROLE-IMPL', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.charter', body: 'Implement.',
    provenance: 'test', selectors: { role: ['implementer'] },
  });
  addContextItem(store, {
    id: 'ROLE-REV', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.charter', body: 'Review.',
    provenance: 'test', selectors: { role: [REVIEWER_ROLE_ID] },
  });
  addResponsibility(store, { id: 'candidate.implement', classification: 'semantic', description: 'Design and materialize a candidate.' });
  addResponsibility(store, { id: 'candidate.review', classification: 'semantic', description: 'Judge a candidate independently.' });
  addResponsibility(store, { id: 'dispatch.execute', classification: 'deterministic', description: 'Execute an authorized dispatch.' });
  addRoleContract(store, {
    roleId: 'implementer', mission: 'Implement bounded work.', contextItemRef: 'ROLE-IMPL@1', inputContractRef: 'task-contract-v1',
    outputContractRef: 'implementation-report-v1', minimumModelCapability: 'implementation',
    exclusiveJudgments: ['candidate.implement'], capabilityRequestClasses: [],
  });

  assert.throws(
    () => { addRoleContract(store, {
      roleId: REVIEWER_ROLE_ID, mission: 'Perform runtime work.', contextItemRef: 'ROLE-REV@1', inputContractRef: 'implementation-report-v1',
      outputContractRef: 'task-contract-v1', minimumModelCapability: 'review',
      exclusiveJudgments: ['dispatch.execute'], capabilityRequestClasses: [],
    }); },
    (error: unknown) => error instanceof ContextError && error.code === ROLE_CATALOG_ERROR.DETERMINISTIC_RESPONSIBILITY,
  );
  addRoleContract(store, {
    roleId: REVIEWER_ROLE_ID, mission: 'Review bounded work.', contextItemRef: 'ROLE-REV@1', inputContractRef: 'implementation-report-v1',
    outputContractRef: 'task-contract-v1', minimumModelCapability: 'review',
    exclusiveJudgments: ['candidate.review'], capabilityRequestClasses: [],
  });
  assert.throws(
    () => { addRoleHandoff(store, { sourceRoleId: 'implementer', targetRoleId: 'implementer', artifactContractRef: 'implementation-report-v1' }); },
    (error: unknown) => error instanceof ContextError && error.code === ROLE_CATALOG_ERROR.SELF_HANDOFF,
  );
  addRoleHandoff(store, { sourceRoleId: 'implementer', targetRoleId: REVIEWER_ROLE_ID, artifactContractRef: 'implementation-report-v1' });
  addRoleHandoff(store, { sourceRoleId: REVIEWER_ROLE_ID, targetRoleId: 'implementer', artifactContractRef: 'task-contract-v1' });
  setRolePolicy(store, {
    roleId: 'implementer', prohibitions: ['scope.change', 'candidate.review'], selfCorrectionMode: 'bounded',
    selfCorrectionScopes: ['implementation-report'], stopConditions: ['scope-change-required'], escalationClasses: ['authority-gap'],
  });
  setRolePolicy(store, {
    roleId: REVIEWER_ROLE_ID, prohibitions: ['candidate.modify', 'promotion.execute'], selfCorrectionMode: 'bounded',
    selfCorrectionScopes: ['review-report'], stopConditions: ['candidate-mutation-required'], escalationClasses: ['acceptance-gap'],
  });
  requireRole(store, 'implementer');
  requireRole(store, REVIEWER_ROLE_ID);
  setRoleCatalogProfile(store, {
    profileId: 'test-profile', entryRoleId: 'implementer', sourceKind: ROLE_CATALOG_PROFILE_SOURCE.CUSTOM,
  });
  assert.deepEqual(checkRoleCatalog(store), { valid: true, violations: [] });
  const activated = activateRoleCatalog(store);
  assert.equal(activated.version, ROLE_CATALOG_INITIAL_VERSION);
  assert.equal(activated.catalogDigest.startsWith('sha256:'), true);
  assert.deepEqual(activateRoleCatalog(store), activated);
  assert.deepEqual(requireActiveRoleCatalog(store), activated);
  assert.deepEqual(checkActiveRoleCatalog(store), { valid: true, violations: [] });

  setRoleContract(store, {
    roleId: REVIEWER_ROLE_ID, mission: 'Independently review bounded work.', contextItemRef: 'ROLE-REV@1',
    inputContractRef: 'implementation-report-v1', outputContractRef: 'task-contract-v1',
    minimumModelCapability: 'review', exclusiveJudgments: ['candidate.review'], capabilityRequestClasses: [],
  });
  assert.equal(listRoleCatalog(store).find((role) => role.roleId === REVIEWER_ROLE_ID)?.definitionVersion,
    ROLE_CATALOG_INITIAL_VERSION + ROLE_DEFINITION_VERSION_INCREMENT);
  const reactivated = activateRoleCatalog(store);
  assert.equal(reactivated.version, ROLE_CATALOG_INITIAL_VERSION + ROLE_CATALOG_VERSION_INCREMENT);

  addResponsibility(store, {
    id: 'candidate.refute', classification: 'semantic', description: 'Challenge a candidate before commitment.',
  });
  assert.throws(
    () => { requireActiveRoleCatalog(store); },
    (error: unknown) => error instanceof ContextError && error.code === ROLE_CATALOG_ERROR.ACTIVE_CATALOG_DRIFT,
  );
  assert.equal(checkActiveRoleCatalog(store).violations[0]?.startsWith(ROLE_CATALOG_ERROR.ACTIVE_CATALOG_DRIFT), true);
  store.close();
});
