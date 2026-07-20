import type { Store } from '../db/store.types.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import { compileProtocolWorkPacket } from './protocol-work.js';
import {
  checkProtocolProposalBatch,
  evaluateAndPersistAssembledProtocolProposal,
} from './protocol-proposal.js';
import { parseAgentJsonOutput } from './structured-output.js';
import { STRUCTURED_OUTPUT_NORMALIZATION } from './structured-output.constants.js';
import type { StructuredOutputReceipt } from './structured-output.types.js';
import type {
  ProtocolProposalBatchEvaluation,
  ProtocolProposalEvaluation,
  ProtocolWorkPacket,
} from './protocol-work.types.js';
import { JSON_SCHEMA_KEY, JSON_SCHEMA_TYPE } from './protocol-work.constants.js';
import { PROTOCOL_PROPOSAL_ERROR } from './protocol-proposal-review.constants.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(text: string, label: string): JsonRecord {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new ContextError('INVALID_PROTOCOL_PROPOSAL_BATCH', `${label} must be an object`);
  return value;
}

// El patrón "runtime-owned, agente no puede pisarlo" se repite 3 veces acá:
// injectRuntimeIdentity fuerza workPacketId/workPacketDigest a los valores
// REALES (si el agente mandó otros, eso es VIOLACIÓN, no se silencia);
// normalizePayloadSchema fuerza type/additionalProperties del schema
// generado, quitándolos si el agente los declaró explícitamente distintos;
// removeRedundantScaffoldProperties depura propiedades que ya vienen del
// scaffold generado para no duplicarlas. Los tres devuelven `{value,
// violations}` — el valor SANEADO se usa igual (el runtime nunca confía
// ciegamente en lo que mandó el agente), pero las violations quedan
// registradas para que la propuesta se rechace si corresponde.
function injectRuntimeIdentity(
  value: unknown,
  workPacketId: string,
  workPacketDigest: string,
): { value: unknown; violations: readonly string[] } {
  if (!isRecord(value)) return { value, violations: [] };
  const violations: string[] = [];
  if (value.workPacketId !== undefined && value.workPacketId !== workPacketId) {
    violations.push('agent-supplied workPacketId conflicts with runtime identity');
  }
  if (value.workPacketDigest !== undefined && value.workPacketDigest !== workPacketDigest) {
    violations.push('agent-supplied workPacketDigest conflicts with runtime identity');
  }
  return { value: { ...value, workPacketId, workPacketDigest }, violations };
}

function normalizePayloadSchema(value: unknown, label: string, violations: string[]): unknown {
  if (!isRecord(value)) return value;
  if (value.type !== undefined && value.type !== JSON_SCHEMA_TYPE.OBJECT) {
    violations.push(`${label}.type conflicts with runtime-owned object type`);
  }
  if (value.additionalProperties !== undefined && value.additionalProperties !== false) {
    violations.push(`${label}.additionalProperties conflicts with runtime-owned closed schema`);
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== JSON_SCHEMA_KEY.TYPE && key !== JSON_SCHEMA_KEY.ADDITIONAL_PROPERTIES));
}

function removeRedundantScaffoldProperties(
  payloadSchema: unknown,
  contractRef: unknown,
  packet: ProtocolWorkPacket,
): unknown {
  if (!isRecord(payloadSchema) || !isRecord(payloadSchema.properties) || typeof contractRef !== 'string') return payloadSchema;
  const payloadProperties = payloadSchema.properties;
  const scaffold = packet.proposalRules.generatedScaffolds.find(({ ref }) => ref === contractRef);
  if (scaffold === undefined) return payloadSchema;
  const redundant = Object.entries(scaffold.properties)
    .filter(([name, schema]) => canonicalJson(payloadProperties[name]) === canonicalJson(schema))
    .map(([name]) => name);
  const properties = Object.fromEntries(Object.entries(payloadProperties)
    .filter(([name]) => !redundant.includes(name)));
  const required = Array.isArray(payloadSchema.required)
    ? payloadSchema.required.filter((name: unknown) => typeof name !== 'string' || !redundant.includes(name))
    : payloadSchema.required;
  return { ...payloadSchema, properties, required };
}

function normalizeRuntimeSchemaDeclarations(
  value: unknown,
  packet: ProtocolWorkPacket,
): { value: unknown; violations: readonly string[] } {
  if (!isRecord(value) || !Array.isArray(value.contracts)) return { value, violations: [] };
  const violations: string[] = [];
  const contractValues: unknown[] = value.contracts.map((contract: unknown) => contract);
  const contracts = contractValues.map((contract, index) => {
    if (!isRecord(contract)) return contract;
    const withoutScaffold = removeRedundantScaffoldProperties(contract.payloadSchema, contract.ref, packet);
    return {
      ...contract,
      payloadSchema: normalizePayloadSchema(withoutScaffold, `contracts[${index}].payloadSchema`, violations),
    };
  });
  return { value: { ...value, contracts }, violations };
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ContextError('INVALID_PROTOCOL_PROPOSAL_BATCH', `${label} must be a string array`);
  }
  return value.filter((item): item is string => typeof item === 'string');
}

export function evaluateAndPersistProtocolProposalBatch(
  store: Store,
  value: unknown,
  assignedRefs: readonly string[],
  authorSessionId: string,
  outputReceipt: StructuredOutputReceipt,
): ProtocolProposalBatchEvaluation {
  const packet = compileProtocolWorkPacket(store);
  const schemaNormalized = normalizeRuntimeSchemaDeclarations(value, packet);
  const normalized = injectRuntimeIdentity(schemaNormalized.value, packet.id, packet.packetDigest);
  return persistNormalizedBatch(
    store, normalized.value, assignedRefs, authorSessionId, outputReceipt,
    [...schemaNormalized.violations, ...normalized.violations],
  );
}

function persistNormalizedBatch(
  store: Store,
  value: unknown,
  assignedRefs: readonly string[],
  authorSessionId: string,
  outputReceipt: StructuredOutputReceipt,
  priorViolations: readonly string[],
  correction?: { sourceBatchId: string; changedRefs: readonly string[] },
): ProtocolProposalBatchEvaluation {
  const packet = compileProtocolWorkPacket(store);
  const checked = checkProtocolProposalBatch(store, value, assignedRefs);
  const violations = [...priorViolations, ...checked.violations];
  const result = { ...checked, valid: violations.length === 0, violations };
  const correctionProvenance = correction === undefined ? {} : {
    sourceBatchId: correction.sourceBatchId,
    changedRefs: [...correction.changedRefs],
  };
  const persisted = isRecord(value)
    ? { ...value, ...correctionProvenance, assignedRefs: [...assignedRefs], authorSessionId, runtimeOutputReceipt: outputReceipt }
    : value;
  const batchDigest = digest(persisted);
  const batchId = `protocol-proposal-batch-${batchDigest.slice(0, 16)}`;
  store.db.prepare(`INSERT OR IGNORE INTO protocol_proposal_batches
    (id, work_packet_id, assigned_refs_json, batch_json, batch_digest, author_session_id,
     valid, violations_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(batchId, packet.id, canonicalJson(assignedRefs), canonicalJson(persisted), batchDigest,
      authorSessionId, result.valid ? 1 : 0, canonicalJson(result.violations), new Date().toISOString());
  return { ...result, batchId, batchDigest };
}

export function ingestProtocolProposalBatchOutput(
  store: Store,
  raw: string,
  assignedRefs: readonly string[],
  authorSessionId: string,
): ProtocolProposalBatchEvaluation {
  const parsed = parseAgentJsonOutput(raw);
  return evaluateAndPersistProtocolProposalBatch(store, parsed.value, assignedRefs, authorSessionId, parsed.receipt);
}

interface StoredBatch {
  id: string;
  assignedRefs: readonly string[];
  authorSessionId: string;
  value: JsonRecord;
  batchDigest: string;
}

function loadBatch(store: Store, batchId: string, workPacketId: string): StoredBatch {
  const row = store.db.prepare(`SELECT work_packet_id, assigned_refs_json, batch_json, batch_digest,
    author_session_id, valid FROM protocol_proposal_batches WHERE id = ?`).get(batchId);
  if (row === undefined) throw new ContextError('UNKNOWN_PROTOCOL_PROPOSAL_BATCH', `unknown batch: ${batchId}`);
  if (stringColumn(row, 'work_packet_id') !== workPacketId) {
    throw new ContextError('STALE_PROTOCOL_PROPOSAL_BATCH', `${batchId} targets another work packet`);
  }
  if (numberColumn(row, 'valid') !== 1) throw new ContextError('INVALID_PROTOCOL_PROPOSAL_BATCH', `${batchId} is mechanically invalid`);
  return {
    id: batchId,
    assignedRefs: stringArray(JSON.parse(stringColumn(row, 'assigned_refs_json')), `${batchId}.assignedRefs`),
    authorSessionId: stringColumn(row, 'author_session_id'),
    value: parseRecord(stringColumn(row, 'batch_json'), batchId),
    batchDigest: stringColumn(row, 'batch_digest'),
  };
}

function contractRecords(batch: StoredBatch): JsonRecord[] {
  const contracts = batch.value.contracts;
  if (!Array.isArray(contracts) || contracts.some((contract) => !isRecord(contract))) {
    throw new ContextError('INVALID_PROTOCOL_PROPOSAL_BATCH', `${batch.id}.contracts is invalid`);
  }
  return contracts.filter((contract): contract is JsonRecord => isRecord(contract));
}

function correctionViolations(source: StoredBatch, value: unknown, changedRefs: readonly string[]): string[] {
  const violations: string[] = [];
  const uniqueChangedRefs = [...new Set(changedRefs)];
  if (changedRefs.length === 0 || uniqueChangedRefs.length !== changedRefs.length) {
    violations.push('changed contract refs must be non-empty and unique');
  }
  violations.push(...changedRefs.filter((ref) => !source.assignedRefs.includes(ref))
    .map((ref) => `changed contract ref is outside source assignment: ${ref}`));
  if (!isRecord(value) || !Array.isArray(value.contracts)) return [...violations, 'corrected batch contracts are unavailable for comparison'];
  const candidate = new Map(value.contracts.filter((contract): contract is JsonRecord => isRecord(contract))
    .filter((contract) => typeof contract.ref === 'string').map((contract) => [String(contract.ref), contract]));
  const original = new Map(contractRecords(source).map((contract) => [String(contract.ref), contract]));
  for (const ref of source.assignedRefs.filter((assignedRef) => !changedRefs.includes(assignedRef))) {
    if (canonicalJson(candidate.get(ref)) !== canonicalJson(original.get(ref))) {
      violations.push(`correction changed unapproved contract fragment: ${ref}`);
    }
  }
  return violations;
}

export function ingestProtocolProposalBatchCorrectionOutput(
  store: Store,
  raw: string,
  sourceBatchId: string,
  changedRefs: readonly string[],
  authorSessionId: string,
): ProtocolProposalBatchEvaluation {
  const packet = compileProtocolWorkPacket(store);
  const source = loadBatch(store, sourceBatchId, packet.id);
  const parsed = parseAgentJsonOutput(raw);
  const schemaNormalized = normalizeRuntimeSchemaDeclarations(parsed.value, packet);
  const normalized = injectRuntimeIdentity(schemaNormalized.value, packet.id, packet.packetDigest);
  const priorViolations = [
    ...schemaNormalized.violations,
    ...normalized.violations,
    ...correctionViolations(source, normalized.value, changedRefs),
  ];
  return persistNormalizedBatch(
    store, normalized.value, source.assignedRefs, authorSessionId, parsed.receipt, priorViolations,
    { sourceBatchId, changedRefs },
  );
}

function indexContracts(batches: readonly StoredBatch[]): ReadonlyMap<string, JsonRecord> {
  const contractByRef = new Map<string, JsonRecord>();
  for (const batch of batches) {
    for (const contract of contractRecords(batch)) {
      const ref = contract.ref;
      if (typeof ref !== 'string') throw new ContextError('INVALID_PROTOCOL_PROPOSAL_BATCH', `${batch.id} has a contract without ref`);
      if (contractByRef.has(ref)) throw new ContextError('DUPLICATE_PROTOCOL_CONTRACT_FRAGMENT', `duplicate contract fragment: ${ref}`);
      contractByRef.set(ref, contract);
    }
  }
  return contractByRef;
}

export function assembleProtocolProposalBatches(store: Store, batchIds: readonly string[]): ProtocolProposalEvaluation {
  const packet = compileProtocolWorkPacket(store);
  const uniqueIds = [...new Set(batchIds)].sort();
  if (uniqueIds.length !== batchIds.length || uniqueIds.length === 0) {
    throw new ContextError('INVALID_PROTOCOL_PROPOSAL_BATCH_SET', 'batch ids must be non-empty and unique');
  }
  const batches = uniqueIds.map((batchId) => loadBatch(store, batchId, packet.id));
  const contractByRef = indexContracts(batches);
  const contracts = packet.proposalRules.exactContractRefs.map((ref) => contractByRef.get(ref));
  if (contracts.some((contract) => contract === undefined) || contractByRef.size !== contracts.length) {
    throw new ContextError(PROTOCOL_PROPOSAL_ERROR.INCOMPLETE_BATCH_SET, 'batch set does not exactly cover the work packet');
  }
  const proposal = {
    workPacketId: packet.id,
    workPacketDigest: packet.packetDigest,
    contracts: contracts.filter((contract): contract is JsonRecord => contract !== undefined),
  };
  const receipt: StructuredOutputReceipt = {
    rawOutputDigest: digest(batches.map(({ batchDigest }) => batchDigest)),
    normalization: STRUCTURED_OUTPUT_NORMALIZATION.RUNTIME_BATCH_ASSEMBLY,
  };
  return evaluateAndPersistAssembledProtocolProposal(
    store,
    proposal,
    batches.map(({ authorSessionId }) => authorSessionId),
    batches.map(({ id }) => id),
    receipt,
  );
}
