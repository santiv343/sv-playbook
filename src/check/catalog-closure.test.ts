import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { addContextItem, replaceContextPrecedence } from '../context/repository.js';
import { addArtifactContract } from '../contracts/artifacts.js';
import { openStore } from '../db/store.js';
import { addExecutionProfile } from '../gateway/profiles.js';
import { addModelCapability, addResponsibility, addRoleContract, requireRole } from '../roles/catalog.js';
import { checkCatalogClosure } from './catalog-closure.js';

const CONTRACT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
} as const;

function addRole(store: ReturnType<typeof openStore>, roleId: string): void {
  const contextId = `ROLE-${roleId.toUpperCase()}`;
  const capabilityId = `capability.${roleId}`;
  const responsibilityId = `responsibility.${roleId}`;
  const inputContract = `input.${roleId}`;
  const outputContract = `output.${roleId}`;
  addArtifactContract(store, { ref: inputContract, schema: CONTRACT_SCHEMA, status: 'active' });
  addArtifactContract(store, { ref: outputContract, schema: CONTRACT_SCHEMA, status: 'active' });
  addModelCapability(store, { id: capabilityId, description: `Capability for ${roleId}` });
  replaceContextPrecedence(store, ['role']);
  addContextItem(store, {
    id: contextId, version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: `role.${roleId}`,
    body: `Role ${roleId}`, provenance: 'test', selectors: { role: [roleId] },
  });
  addResponsibility(store, { id: responsibilityId, classification: 'semantic', description: `Responsibility for ${roleId}` });
  addRoleContract(store, {
    roleId, mission: `Judge ${roleId} work.`, contextItemRef: `${contextId}@1`, inputContractRef: inputContract,
    outputContractRef: outputContract, minimumModelCapability: capabilityId,
    exclusiveJudgments: [responsibilityId], capabilityRequestClasses: [],
  });
  requireRole(store, roleId);
}

test('catalog closure rejects required roles missing from execution profiles and adapter projections', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-catalog-closure-'));
  const store = openStore(root);
  addRole(store, 'planner');
  addRole(store, 'refuter');

  addExecutionProfile(store, {
    id: 'planner-profile', roleId: 'planner', adapterId: 'fake-adapter', agentId: 'planner',
    providerId: 'fake-provider', modelId: 'fake-model', adapterConfig: {},
    observationIntervalMs: 1, noProgressTimeoutMs: 1, cancellationGraceMs: 1,
    tools: { read: true }, enabled: true,
  });

  const result = checkCatalogClosure(store, [{ adapterId: 'fake-adapter', agentIds: ['founder-interface', 'planner'] }]);

  assert.equal(result.valid, false);
  assert.ok(result.violations.includes('refuter: no enabled execution profile'));
  assert.ok(result.violations.includes('fake-adapter: unmanaged projected agent founder-interface'));
  store.close();
});

test('catalog closure accepts exact required role profile projection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-catalog-closure-'));
  const store = openStore(root);
  addRole(store, 'planner');
  addExecutionProfile(store, {
    id: 'planner-profile', roleId: 'planner', adapterId: 'fake-adapter', agentId: 'planner',
    providerId: 'fake-provider', modelId: 'fake-model', adapterConfig: {},
    observationIntervalMs: 1, noProgressTimeoutMs: 1, cancellationGraceMs: 1,
    tools: { read: true }, enabled: true,
  });

  assert.deepEqual(
    checkCatalogClosure(store, [{ adapterId: 'fake-adapter', agentIds: ['planner'] }]),
    { valid: true, violations: [] },
  );
  store.close();
});
