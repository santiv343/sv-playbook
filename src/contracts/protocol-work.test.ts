import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '../db/store.types.js';
import { openStore } from '../db/store.js';
import { CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { addContextItem } from '../context/repository.js';
import {
  addModelCapability,
  addResponsibility,
  addRoleContract,
  addRoleHandoff,
  requireRole,
  setRolePolicy,
} from '../roles/catalog.js';
import {
  compileProtocolWorkPacket,
  inspectProtocolWorkPacket,
  registerProtocolSupport,
} from './protocol-work.js';
import { checkProtocolProposal } from './protocol-proposal.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { ContextError } from '../context/context.errors.js';
import { STRUCTURED_OUTPUT_ERROR } from './structured-output.constants.js';

const INTENT_CONTRACT_REF = 'intent-v1';
const PLAN_CONTRACT_REF = 'plan-v1';
import {
  applyApprovedReconciliation,
  evaluateAndPersistReconciliationProposal,
  evaluateAndPersistReconciliationReview,
  ingestReconciliationProposalOutput,
} from './protocol-reconciliation.js';

const SHARED_ID = 'urn:test:protocol-shared:1.0.0';
const METADATA_SCHEMA_ID = 'urn:test:protocol-metadata:1.0.0';

function registerSupport(store: Store): void {
  registerProtocolSupport(store, {
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: SHARED_ID,
      $defs: {
        provenance: {
          type: 'object', additionalProperties: false,
          properties: {
            provenance_kind: { type: 'string' }, agent_role_id: { type: ['string', 'null'] },
            session_id: { type: ['string', 'null'] }, timestamp: { type: 'string' }, confirmed_by: { type: ['string', 'null'] },
          },
          required: ['provenance_kind', 'agent_role_id', 'session_id', 'timestamp', 'confirmed_by'],
        },
        escalation: {
          type: 'object', additionalProperties: false,
          properties: { escalation_class: { enum: ['contract-violation'] } },
          required: ['escalation_class'],
        },
        'correction-record': { type: 'object' },
      },
    },
    metadataSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: METADATA_SCHEMA_ID,
      type: 'object', additionalProperties: false,
      properties: {
        schema_id: { type: 'string' },
        escalation: { $ref: `${SHARED_ID}#/$defs/escalation` },
      },
      required: ['schema_id'],
    },
    metadata: { schema_id: SHARED_ID },
  });
}

function addRole(store: Store, escalationClass = 'contract-violation'): void {
  addModelCapability(store, { id: 'planning', description: 'Can make planning judgments.' });
  addContextItem(store, {
    id: 'ROLE-PLANNER', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.planner', body: 'Plan.',
    provenance: 'test', selectors: { role: ['planner'] },
  });
  addResponsibility(store, { id: 'delivery.plan', classification: 'semantic', description: 'Plan delivery.' });
  addResponsibility(store, { id: 'dispatch.execute', classification: 'deterministic', description: 'Dispatch through the runtime.' });
  addRoleContract(store, {
    roleId: 'planner', mission: 'Plan delivery.', contextItemRef: 'ROLE-PLANNER@1', inputContractRef: 'intent-v1',
    outputContractRef: 'plan-v1', minimumModelCapability: 'planning',
    exclusiveJudgments: ['delivery.plan'], capabilityRequestClasses: [],
  });
  addRoleHandoff(store, { sourceRoleId: 'planner', targetRoleId: 'planner-target', artifactContractRef: 'plan-v1' });
  setRolePolicy(store, {
    roleId: 'planner', prohibitions: ['dispatch.execute'], selfCorrectionMode: 'bounded',
    selfCorrectionScopes: ['plan'], stopConditions: ['intent-gap'], escalationClasses: [escalationClass],
  });
  requireRole(store, 'planner');
}

function addTargetRole(store: Store): void {
  addModelCapability(store, { id: 'review', description: 'Can review plans.' });
  addContextItem(store, {
    id: 'ROLE-TARGET', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.target', body: 'Review.',
    provenance: 'test', selectors: { role: ['planner-target'] },
  });
  addResponsibility(store, { id: 'plan.review', classification: 'semantic', description: 'Review plans.' });
  addRoleContract(store, {
    roleId: 'planner-target', mission: 'Review plans.', contextItemRef: 'ROLE-TARGET@1', inputContractRef: 'plan-v1',
    outputContractRef: 'review-v1', minimumModelCapability: 'review',
    exclusiveJudgments: ['plan.review'], capabilityRequestClasses: [],
  });
  setRolePolicy(store, {
    roleId: 'planner-target', prohibitions: ['dispatch.execute'], selfCorrectionMode: 'bounded',
    selfCorrectionScopes: ['review'], stopConditions: ['evidence-gap'], escalationClasses: ['contract-violation'],
  });
  requireRole(store, 'planner-target');
}

function fragment(ref: string): Record<string, unknown> {
  return {
    ref,
    purpose: `Semantic payload for ${ref}`,
    payloadSchema: {
      properties: { summary: { type: 'string', minLength: 1 } },
      required: ['summary'],
    },
    semanticInvariants: [],
    mechanizationCandidates: [],
    validExamples: [{ summary: 'specific result' }],
    invalidExamples: [{}],
  };
}

test('protocol work packet deterministically derives the exact role and contract graph', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-protocol-work-'));
  const store = openStore(root);
  registerSupport(store);
  addTargetRole(store);
  addRole(store);
  const first = compileProtocolWorkPacket(store);
  const second = compileProtocolWorkPacket(store);
  assert.equal(first.id, second.id);
  assert.equal(first.packetDigest, second.packetDigest);
  assert.deepEqual(first.proposalRules.exactContractRefs, ['intent-v1', 'plan-v1', 'review-v1']);
  assert.equal(first.contracts.find(({ ref }) => ref === PLAN_CONTRACT_REF)?.inputForRoles[0], 'planner-target');
  assert.equal(first.contracts.find(({ ref }) => ref === PLAN_CONTRACT_REF)?.outputFromRoles[0], 'planner');
  const count = store.db.prepare('SELECT count(*) AS count FROM protocol_work_packets').get();
  assert.equal(numberColumn(count, 'count'), 1);
  store.close();
});

test('protocol source inspection mechanically rejects role escalation classes outside the shared vocabulary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-protocol-vocabulary-'));
  const store = openStore(root);
  registerSupport(store);
  addTargetRole(store);
  addRole(store, 'invented-route');
  const inspection = inspectProtocolWorkPacket(store);
  assert.equal(inspection.valid, false);
  assert.ok(inspection.violations.includes('planner: unsupported escalation class invented-route'));
  store.close();
});

test('proposal gate accepts only exact semantic fragments and runtime-owned schema structure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-protocol-proposal-'));
  const store = openStore(root);
  registerSupport(store);
  addTargetRole(store);
  addRole(store);
  const packet = compileProtocolWorkPacket(store);
  const contracts = packet.proposalRules.exactContractRefs.map(fragment);
  const accepted = checkProtocolProposal(store, {
    workPacketId: packet.id,
    workPacketDigest: packet.packetDigest,
    contracts,
  });
  assert.equal(accepted.valid, true, accepted.violations.join('\n'));

  const rejected = checkProtocolProposal(store, {
    workPacketId: packet.id,
    workPacketDigest: packet.packetDigest,
    contracts: [
      { ...fragment('intent-v1'), payloadSchema: { $id: 'agent-owned', properties: {}, required: [] } },
    ],
  });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.violations.some((violation) => violation.includes('missing contract fragment')));
  assert.ok(rejected.violations.some((violation) => violation.includes('runtime-owned')));

  const strictSchemaFailure = checkProtocolProposal(store, {
    workPacketId: packet.id,
    workPacketDigest: packet.packetDigest,
    contracts: contracts.map((contract) => contract.ref === INTENT_CONTRACT_REF
      ? { ...contract, payloadSchema: { properties: { evidence: { minItems: 1 } }, required: ['evidence'] } }
      : contract),
  });
  assert.equal(strictSchemaFailure.valid, false);
  assert.ok(strictSchemaFailure.violations.some((violation) => violation.includes('missing type "array"')));
  store.close();
});

test('escalation reconciliation requires exact coverage, independent review, and deterministic application', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-protocol-reconcile-'));
  const store = openStore(root);
  registerSupport(store);
  addTargetRole(store);
  addRole(store, 'invented-route');
  const packet = inspectProtocolWorkPacket(store).packet;
  const proposal = {
    workPacketId: packet.id,
    workPacketDigest: packet.packetDigest,
    mappings: [{
      roleId: 'planner', sourceClass: 'invented-route', targetClass: 'contract-violation',
      rationale: 'The source condition describes a violation of the declared protocol contract.',
    }],
  };
  const proposalCheck = evaluateAndPersistReconciliationProposal(store, proposal, 'planner-session');
  assert.equal(proposalCheck.valid, true, proposalCheck.violations.join('\n'));

  const selfReview = evaluateAndPersistReconciliationReview(store, {
    proposalId: proposalCheck.proposalId,
    proposalDigest: proposalCheck.proposalDigest,
    verdict: 'PASS',
    findings: [],
  }, 'planner-session');
  assert.equal(selfReview.valid, false);
  assert.ok(selfReview.violations.includes('reviewer session must be independent from author session'));

  const unknownFinding = evaluateAndPersistReconciliationReview(store, {
    proposalId: proposalCheck.proposalId,
    proposalDigest: proposalCheck.proposalDigest,
    verdict: 'FAIL',
    findings: [{ mappingKey: 'planner:not-in-proposal', issue: 'Unknown mapping.', requiredCorrection: 'Remove it.' }],
  }, 'other-refuter-session');
  assert.equal(unknownFinding.valid, false);
  assert.ok(unknownFinding.violations.includes('unknown review mapping key: planner:not-in-proposal'));

  const independentReview = evaluateAndPersistReconciliationReview(store, {
    proposalId: proposalCheck.proposalId,
    proposalDigest: proposalCheck.proposalDigest,
    verdict: 'PASS',
    findings: [],
  }, 'refuter-session');
  assert.equal(independentReview.valid, true, independentReview.violations.join('\n'));
  const duplicateReview = evaluateAndPersistReconciliationReview(store, {
    proposalId: proposalCheck.proposalId,
    proposalDigest: proposalCheck.proposalDigest,
    verdict: 'PASS',
    findings: [],
  }, 'second-refuter-session');
  assert.equal(duplicateReview.valid, false);
  assert.ok(duplicateReview.violations.includes('proposal already has a terminal review'));
  applyApprovedReconciliation(store, proposalCheck.proposalId);
  assert.equal(inspectProtocolWorkPacket(store).valid, true);
  store.close();
});

test('structured ingestion accepts one exact JSON fence, records it, and rejects surrounding prose', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-protocol-ingest-'));
  const store = openStore(root);
  registerSupport(store);
  addTargetRole(store);
  addRole(store, 'invented-route');
  const packet = inspectProtocolWorkPacket(store).packet;
  const value = {
    workPacketId: packet.id,
    workPacketDigest: packet.packetDigest,
    mappings: [{
      roleId: 'planner', sourceClass: 'invented-route', targetClass: 'contract-violation',
      rationale: 'The condition is a contract mismatch.',
    }],
  };
  const result = ingestReconciliationProposalOutput(store, `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``, 'planner-session');
  assert.equal(result.valid, true, result.violations.join('\n'));
  const compactFence = ingestReconciliationProposalOutput(store, `\`\`\`json\n${JSON.stringify(value)}\`\`\``, 'planner-session-2');
  assert.equal(compactFence.valid, true, compactFence.violations.join('\n'));
  const row = store.db.prepare('SELECT proposal_json FROM protocol_reconciliation_proposals WHERE id = ?').get(result.proposalId);
  assert.match(stringColumn(row, 'proposal_json'), /single-json-fence/);
  assert.throws(
    () => ingestReconciliationProposalOutput(store, `Here is JSON:\n${JSON.stringify(value)}`, 'other-session'),
    (error: unknown) => error instanceof ContextError && error.code === STRUCTURED_OUTPUT_ERROR.INVALID,
  );
  store.close();
});

test('approved additive vocabulary evolution versions shared schemas mechanically before applying mappings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-protocol-evolution-'));
  const store = openStore(root);
  registerSupport(store);
  addTargetRole(store);
  addRole(store, 'invented-route');
  const packet = inspectProtocolWorkPacket(store).packet;
  const proposalCheck = evaluateAndPersistReconciliationProposal(store, {
    workPacketId: packet.id,
    workPacketDigest: packet.packetDigest,
    vocabularyAdditions: [{
      classId: 'information-gap',
      definition: 'Required information or evidence is unavailable or incomplete.',
      distinction: 'Unlike ambiguous-input, the known input is not conflicting; required information is absent.',
    }],
    mappings: [{
      roleId: 'planner', sourceClass: 'invented-route', targetClass: 'information-gap',
      rationale: 'The synthetic source represents missing information.',
    }],
  }, 'planner-session');
  assert.equal(proposalCheck.valid, true, proposalCheck.violations.join('\n'));
  const review = evaluateAndPersistReconciliationReview(store, {
    proposalId: proposalCheck.proposalId,
    proposalDigest: proposalCheck.proposalDigest,
    verdict: 'PASS',
    findings: [],
  }, 'refuter-session');
  assert.equal(review.valid, true, review.violations.join('\n'));
  applyApprovedReconciliation(store, proposalCheck.proposalId);
  const shared = store.db.prepare('SELECT contract_ref FROM protocol_shared_schemas').get();
  assert.equal(stringColumn(shared, 'contract_ref'), 'urn:test:protocol-shared:1.1.0');
  assert.equal(inspectProtocolWorkPacket(store).valid, true);
  store.close();
});
