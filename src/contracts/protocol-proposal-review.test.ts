import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '../db/store.types.js';
import { openStore } from '../db/store.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { addContextItem, replaceContextPrecedence } from '../context/repository.js';
import {
  addModelCapability,
  addResponsibility,
  addRoleContract,
  requireRole,
  setRolePolicy,
} from '../roles/catalog.js';
import { checkArtifactContracts } from './artifacts.js';
import { compileProtocolWorkPacket, registerProtocolSupport } from './protocol-work.js';
import { evaluateAndPersistProtocolProposal } from './protocol-proposal.js';
import { activateApprovedProtocolProposal, ingestProtocolProposalReviewOutput } from './protocol-proposal-review.js';
import {
  assembleProtocolProposalBatches,
  ingestProtocolProposalBatchCorrectionOutput,
  ingestProtocolProposalBatchOutput,
} from './protocol-proposal-batch.js';
import { ContextError } from '../context/context.errors.js';
import { PROTOCOL_PROPOSAL_ERROR } from './protocol-proposal-review.constants.js';

const SHARED_ID = 'urn:test:proposal-shared:1.0.0';

function registerSupport(store: Store): void {
  registerProtocolSupport(store, {
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', $id: SHARED_ID,
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
          properties: { escalation_class: { enum: ['contract-violation'] } }, required: ['escalation_class'],
        },
        'correction-record': { type: 'object' },
      },
    },
    metadataSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:test:proposal-metadata:1.0.0',
      type: 'object', properties: { schema_id: { type: 'string' } }, required: ['schema_id'],
    },
    metadata: { schema_id: SHARED_ID },
  });
}

function registerPlanner(store: Store): void {
  replaceContextPrecedence(store, ['role']);
  addModelCapability(store, { id: 'planning', description: 'Can make planning judgments.' });
  addContextItem(store, {
    id: 'ROLE-PLANNER', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.planner', body: 'Plan.',
    provenance: 'test', selectors: { role: ['planner'] },
  });
  addResponsibility(store, { id: 'delivery.plan', classification: 'semantic', description: 'Plan delivery.' });
  addResponsibility(store, { id: 'dispatch.execute', classification: 'deterministic', description: 'Dispatch through runtime.' });
  addRoleContract(store, {
    roleId: 'planner', mission: 'Plan delivery.', contextItemRef: 'ROLE-PLANNER@1', inputContractRef: 'intent-v1',
    outputContractRef: 'plan-v1', minimumModelCapability: 'planning',
    exclusiveJudgments: ['delivery.plan'], capabilityRequestClasses: [],
  });
  setRolePolicy(store, {
    roleId: 'planner', prohibitions: ['dispatch.execute'], selfCorrectionMode: 'bounded',
    selfCorrectionScopes: ['plan'], stopConditions: ['intent-gap'], escalationClasses: ['contract-violation'],
  });
  requireRole(store, 'planner');
}

function contractFragment(ref: string): Record<string, unknown> {
  return {
    ref, purpose: `Semantic payload for ${ref}`,
    payloadSchema: { properties: { summary: { type: 'string', minLength: 1 } }, required: ['summary'] },
    semanticInvariants: [], mechanizationCandidates: [],
    validExamples: [{ summary: 'specific result' }], invalidExamples: [{}],
  };
}

test('protocol proposal lifecycle enforces authorship, independent review, and deterministic activation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-proposal-lifecycle-'));
  const store = openStore(root);
  registerSupport(store);
  registerPlanner(store);
  const packet = compileProtocolWorkPacket(store);
  const proposal = {
    workPacketId: packet.id,
    workPacketDigest: packet.packetDigest,
    contracts: packet.proposalRules.exactContractRefs.map(contractFragment),
  };
  const evaluated = evaluateAndPersistProtocolProposal(store, proposal, 'planner-session');
  assert.equal(evaluated.valid, true, evaluated.violations.join('\n'));

  const reviewValue = {
    proposalId: evaluated.proposalId, proposalDigest: evaluated.proposalDigest, verdict: 'PASS', findings: [],
  };
  const selfReview = ingestProtocolProposalReviewOutput(store, JSON.stringify(reviewValue), 'planner-session');
  assert.equal(selfReview.valid, false);
  assert.ok(selfReview.violations.includes('reviewer session must be independent from author session'));

  const independentReview = ingestProtocolProposalReviewOutput(store, JSON.stringify(reviewValue), 'reviewer-session');
  assert.equal(independentReview.valid, true, independentReview.violations.join('\n'));
  const secondReview = ingestProtocolProposalReviewOutput(store, JSON.stringify(reviewValue), 'other-reviewer-session');
  assert.equal(secondReview.valid, false);
  assert.ok(secondReview.violations.includes('proposal already has a terminal review'));

  activateApprovedProtocolProposal(store, evaluated.proposalId);
  const proposalRow = store.db.prepare('SELECT status FROM protocol_proposals WHERE id = ?').get(evaluated.proposalId);
  assert.equal(stringColumn(proposalRow, 'status'), 'applied');
  const activationCount = store.db.prepare('SELECT COUNT(*) AS count FROM artifact_contract_activations WHERE proposal_id = ?')
    .get(evaluated.proposalId);
  assert.equal(numberColumn(activationCount, 'count'), packet.proposalRules.exactContractRefs.length);
  const catalogCheck = checkArtifactContracts(store);
  assert.equal(catalogCheck.valid, true, catalogCheck.violations.join('\n'));
  store.close();
});

test('runtime assembles exact proposal batches and preserves every author for independence checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-proposal-batches-'));
  const store = openStore(root);
  registerSupport(store);
  registerPlanner(store);
  const packet = compileProtocolWorkPacket(store);
  const [firstRef, secondRef] = packet.proposalRules.exactContractRefs;
  if (firstRef === undefined || secondRef === undefined) throw new Error('fixture requires two contracts');
  const batchValue = (ref: string): Record<string, unknown> => ({
    contracts: [{ ...contractFragment(ref), payloadSchema: {
      type: 'object', properties: {
        summary: { type: 'string', minLength: 1 },
        provenance: { $ref: `${SHARED_ID}#/$defs/provenance` },
      }, required: ['summary', 'provenance'],
    } }],
  });
  const conflict = ingestProtocolProposalBatchOutput(store, JSON.stringify({
    ...batchValue(firstRef), workPacketId: 'agent-invented-id',
  }), [firstRef], 'conflicting-author');
  assert.equal(conflict.valid, false);
  assert.ok(conflict.violations.includes('agent-supplied workPacketId conflicts with runtime identity'));
  const schemaConflict = ingestProtocolProposalBatchOutput(store, JSON.stringify({
    contracts: [{ ...contractFragment(firstRef), payloadSchema: {
      type: 'array', properties: { summary: { type: 'string' } }, required: ['summary'],
    } }],
  }), [firstRef], 'schema-conflicting-author');
  assert.equal(schemaConflict.valid, false);
  assert.ok(schemaConflict.violations.includes('contracts[0].payloadSchema.type conflicts with runtime-owned object type'));
  const first = ingestProtocolProposalBatchOutput(store, JSON.stringify(batchValue(firstRef)), [firstRef], 'batch-author-1');
  const second = ingestProtocolProposalBatchOutput(store, JSON.stringify(batchValue(secondRef)), [secondRef], 'batch-author-2');
  assert.equal(first.valid, true, first.violations.join('\n'));
  assert.equal(second.valid, true, second.violations.join('\n'));
  const correctionSourceValue = { contracts: [contractFragment(firstRef), contractFragment(secondRef)] };
  const correctionSource = ingestProtocolProposalBatchOutput(
    store, JSON.stringify(correctionSourceValue), [firstRef, secondRef], 'correction-source-author',
  );
  const boundedCorrection = ingestProtocolProposalBatchCorrectionOutput(store, JSON.stringify({
    contracts: [{ ...contractFragment(firstRef), purpose: 'Corrected first contract.' }, contractFragment(secondRef)],
  }), correctionSource.batchId, [firstRef], 'bounded-correction-author');
  assert.equal(boundedCorrection.valid, true, boundedCorrection.violations.join('\n'));
  const lateralCorrection = ingestProtocolProposalBatchCorrectionOutput(store, JSON.stringify({
    contracts: [
      { ...contractFragment(firstRef), purpose: 'Another first correction.' },
      { ...contractFragment(secondRef), purpose: 'Unapproved lateral correction.' },
    ],
  }), correctionSource.batchId, [firstRef], 'lateral-correction-author');
  assert.equal(lateralCorrection.valid, false);
  assert.ok(lateralCorrection.violations.includes(`correction changed unapproved contract fragment: ${secondRef}`));
  assert.throws(
    () => { assembleProtocolProposalBatches(store, [first.batchId]); },
    (error: unknown) => error instanceof ContextError && error.code === PROTOCOL_PROPOSAL_ERROR.INCOMPLETE_BATCH_SET,
  );

  const assembled = assembleProtocolProposalBatches(store, [second.batchId, first.batchId]);
  assert.equal(assembled.valid, true, assembled.violations.join('\n'));
  const review = {
    proposalId: assembled.proposalId, proposalDigest: assembled.proposalDigest, verdict: 'PASS', findings: [],
  };
  const authorReview = ingestProtocolProposalReviewOutput(store, JSON.stringify(review), 'batch-author-2');
  assert.equal(authorReview.valid, false);
  assert.ok(authorReview.violations.includes('reviewer session must be independent from author session'));
  const independentReview = ingestProtocolProposalReviewOutput(store, JSON.stringify(review), 'independent-reviewer');
  assert.equal(independentReview.valid, true, independentReview.violations.join('\n'));

  const alternateProposal = (purposeSuffix: string) => ({
    workPacketId: packet.id,
    workPacketDigest: packet.packetDigest,
    contracts: packet.proposalRules.exactContractRefs.map((ref) => ({
      ...contractFragment(ref), purpose: `Semantic payload for ${ref}: ${purposeSuffix}`,
    })),
  });
  const multiFindingSubject = evaluateAndPersistProtocolProposal(store, alternateProposal('multi'), 'other-author');
  const findings = [
    { contractRef: firstRef, issue: 'First semantic issue.', requiredCorrection: 'Correct the first issue.' },
    { contractRef: firstRef, issue: 'Second semantic issue.', requiredCorrection: 'Correct the second issue.' },
  ];
  const multiFindingReview = ingestProtocolProposalReviewOutput(store, JSON.stringify({
    proposalId: multiFindingSubject.proposalId, proposalDigest: multiFindingSubject.proposalDigest,
    verdict: 'FAIL', findings,
  }), 'multi-finding-reviewer');
  assert.equal(multiFindingReview.valid, true, multiFindingReview.violations.join('\n'));

  const duplicateSubject = evaluateAndPersistProtocolProposal(store, alternateProposal('duplicate'), 'third-author');
  const duplicateReview = ingestProtocolProposalReviewOutput(store, JSON.stringify({
    proposalId: duplicateSubject.proposalId, proposalDigest: duplicateSubject.proposalDigest,
    verdict: 'FAIL', findings: [findings[0], findings[0]],
  }), 'duplicate-reviewer');
  assert.equal(duplicateReview.valid, false);
  assert.ok(duplicateReview.violations.includes(`duplicate review finding: ${firstRef}`));
  store.close();
});
