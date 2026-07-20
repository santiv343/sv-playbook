import type { Store } from '../db/store.types.js';
import { stringColumn } from '../db/rows.js';
import { canonicalJson, digest } from '../context/digest.js';
import { createArtifactValidator } from './artifacts.js';
import { JSON_SCHEMA_KEY, PROPOSAL_FORBIDDEN_KEYWORDS, PROPOSAL_TOP_LEVEL_KEYS, PROTOCOL_CONTRACT_ID_PREFIX } from './protocol-work.constants.js';
import { compileProtocolWorkPacket } from './protocol-work.js';
import { parseAgentJsonOutput } from './structured-output.js';
import { STRUCTURED_OUTPUT_NORMALIZATION } from './structured-output.constants.js';
import type { StructuredOutputReceipt } from './structured-output.types.js';
import type {
  ProtocolContractFragment,
  ProtocolMechanizationCandidate,
  ProtocolProposalCheck,
  ProtocolProposalEvaluation,
  ProtocolSemanticInvariant,
  ProtocolSemanticProposal,
  ProtocolWorkPacket,
} from './protocol-work.types.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(value: string, label: string): JsonRecord {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new TypeError(`${label} must be an object`);
  return parsed;
}

function nonEmptyString(record: JsonRecord, key: string, label: string, violations: string[]): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  violations.push(`${label}.${key} is required`);
  return undefined;
}

function unknownArray(record: JsonRecord, key: string, label: string, violations: string[]): unknown[] | undefined {
  const value = record[key];
  if (Array.isArray(value)) return value.map((item: unknown) => item);
  violations.push(`${label}.${key} must be an array`);
  return undefined;
}

interface FragmentParts {
  ref: string | undefined;
  purpose: string | undefined;
  payloadSchema: JsonRecord | undefined;
  semantic: ProtocolSemanticInvariant[] | undefined;
  candidates: ProtocolMechanizationCandidate[] | undefined;
  validExamples: unknown[] | undefined;
  invalidExamples: unknown[] | undefined;
}

interface CompleteFragmentParts {
  ref: string;
  purpose: string;
  payloadSchema: JsonRecord;
  semantic: ProtocolSemanticInvariant[];
  candidates: ProtocolMechanizationCandidate[];
  validExamples: unknown[];
  invalidExamples: unknown[];
}

// Parseo "todo o nada" con acumulación de violaciones: cada parseX registra
// SUS problemas en `violations` (mutación compartida) pero sigue procesando
// el resto en vez de abortar en el primer error — así un agente que mandó
// una propuesta con 5 problemas se entera de los 5 en una sola pasada, no
// uno por reintento. completeFragment() es el punto donde se decide si,
// pese a las violations acumuladas, hay suficiente estructura como para
// devolver un objeto tipado (todos los campos !== undefined) o no.
function completeFragment(parts: FragmentParts): parts is CompleteFragmentParts {
  return Object.values(parts).every((value) => value !== undefined);
}

function parseSemanticInvariants(value: unknown[] | undefined, label: string, violations: string[]): ProtocolSemanticInvariant[] | undefined {
  if (value === undefined) return undefined;
  const parsed: ProtocolSemanticInvariant[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      violations.push(`${label}[${index}] must be an object`);
      continue;
    }
    const itemLabel = `${label}[${index}]`;
    const id = nonEmptyString(item, 'id', itemLabel, violations);
    const statement = nonEmptyString(item, 'statement', itemLabel, violations);
    const evidenceRequirement = nonEmptyString(item, 'evidenceRequirement', itemLabel, violations);
    if (id !== undefined && statement !== undefined && evidenceRequirement !== undefined) {
      parsed.push({ id, statement, evidenceRequirement });
    }
  }
  return parsed.length === value.length ? parsed : undefined;
}

function parseMechanizationCandidates(
  value: unknown[] | undefined,
  label: string,
  violations: string[],
): ProtocolMechanizationCandidate[] | undefined {
  if (value === undefined) return undefined;
  const parsed: ProtocolMechanizationCandidate[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      violations.push(`${label}[${index}] must be an object`);
      continue;
    }
    const itemLabel = `${label}[${index}]`;
    const statement = nonEmptyString(item, 'statement', itemLabel, violations);
    const reason = nonEmptyString(item, 'reasonNotCurrentlyDerivable', itemLabel, violations);
    if (statement !== undefined && reason !== undefined) parsed.push({ statement, reasonNotCurrentlyDerivable: reason });
  }
  return parsed.length === value.length ? parsed : undefined;
}

function parseFragment(value: unknown, index: number, violations: string[]): ProtocolContractFragment | undefined {
  const label = `contracts[${index}]`;
  if (!isRecord(value)) {
    violations.push(`${label} must be an object`);
    return undefined;
  }
  const parts: FragmentParts = {
    ref: nonEmptyString(value, 'ref', label, violations),
    purpose: nonEmptyString(value, 'purpose', label, violations),
    payloadSchema: isRecord(value.payloadSchema) ? value.payloadSchema : undefined,
    semantic: parseSemanticInvariants(unknownArray(value, 'semanticInvariants', label, violations), `${label}.semanticInvariants`, violations),
    candidates: parseMechanizationCandidates(unknownArray(value, 'mechanizationCandidates', label, violations), `${label}.mechanizationCandidates`, violations),
    validExamples: unknownArray(value, 'validExamples', label, violations),
    invalidExamples: unknownArray(value, 'invalidExamples', label, violations),
  };
  if (parts.payloadSchema === undefined) violations.push(`${label}.payloadSchema must be an object`);
  if (!completeFragment(parts)) return undefined;
  return {
    ref: parts.ref,
    purpose: parts.purpose,
    payloadSchema: parts.payloadSchema,
    semanticInvariants: parts.semantic,
    mechanizationCandidates: parts.candidates,
    validExamples: parts.validExamples,
    invalidExamples: parts.invalidExamples,
  };
}

function parseProposal(value: unknown, violations: string[]): ProtocolSemanticProposal | undefined {
  if (!isRecord(value)) {
    violations.push('proposal must be an object');
    return undefined;
  }
  const workPacketId = nonEmptyString(value, 'workPacketId', 'proposal', violations);
  const workPacketDigest = nonEmptyString(value, 'workPacketDigest', 'proposal', violations);
  const contractValues = unknownArray(value, 'contracts', 'proposal', violations);
  if (contractValues === undefined) return undefined;
  const contracts = contractValues.map((item, index) => parseFragment(item, index, violations));
  if (workPacketId === undefined || workPacketDigest === undefined || contracts.some((item) => item === undefined)) return undefined;
  return { workPacketId, workPacketDigest, contracts: contracts.filter((item): item is ProtocolContractFragment => item !== undefined) };
}

function stringArray(value: unknown, label: string, violations: string[]): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    violations.push(`${label} must be an array of strings`);
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function inspectSchemaEntry(key: string, child: unknown, path: string, allowedRefs: ReadonlySet<string>, violations: string[]): void {
  if (PROPOSAL_FORBIDDEN_KEYWORDS.has(key)) violations.push(`${path}.${key} is runtime-owned`);
  if (key === JSON_SCHEMA_KEY.REF && (typeof child !== 'string' || !allowedRefs.has(child))) violations.push(`${path}.$ref is not allowlisted`);
  inspectSchemaKeywords(child, `${path}.${key}`, allowedRefs, violations);
}

function inspectSchemaKeywords(value: unknown, path: string, allowedRefs: ReadonlySet<string>, violations: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => { inspectSchemaKeywords(item, `${path}[${index}]`, allowedRefs, violations); });
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) inspectSchemaEntry(key, child, path, allowedRefs, violations);
  }
}

function payloadProperties(fragment: ProtocolContractFragment, packet: ProtocolWorkPacket, violations: string[]): JsonRecord {
  const properties = fragment.payloadSchema.properties;
  if (!isRecord(properties)) {
    violations.push(`${fragment.ref}.payloadSchema.properties must be an object`);
    return {};
  }
  const pattern = new RegExp(packet.proposalRules.propertyNamePattern);
  for (const name of Object.keys(properties).filter((name) => !pattern.test(name))) {
    violations.push(`${fragment.ref}: invalid property name ${name}`);
  }
  return properties;
}

function composeSchema(fragment: ProtocolContractFragment, packet: ProtocolWorkPacket, violations: string[]): JsonRecord {
  for (const key of Object.keys(fragment.payloadSchema).filter((key) => !PROPOSAL_TOP_LEVEL_KEYS.has(key))) {
    violations.push(`${fragment.ref}.payloadSchema.${key} is not agent-owned`);
  }
  const payload = payloadProperties(fragment, packet, violations);
  const scaffold = packet.proposalRules.generatedScaffolds.find(({ ref }) => ref === fragment.ref);
  if (scaffold === undefined) violations.push(`${fragment.ref}: missing runtime scaffold`);
  const scaffoldProperties = scaffold?.properties ?? {};
  for (const name of Object.keys(payload).filter((name) => name in scaffoldProperties)) {
    violations.push(`${fragment.ref}: property ${name} is runtime-owned`);
  }
  const properties = { ...payload, ...scaffoldProperties };
  const payloadRequired = stringArray(fragment.payloadSchema.required, `${fragment.ref}.payloadSchema.required`, violations);
  for (const name of payloadRequired.filter((name) => !(name in payload))) violations.push(`${fragment.ref}: required property ${name} is undefined`);
  const required = [...new Set([...(scaffold?.required ?? []), ...payloadRequired])];
  inspectSchemaKeywords(fragment.payloadSchema, fragment.ref, new Set(packet.proposalRules.allowedSharedDefinitions), violations);
  return {
    $schema: packet.proposalRules.generatedSchemaDialect,
    $id: contractId(fragment.ref),
    description: fragment.purpose,
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
}

function contractId(ref: string): string {
  return `${PROTOCOL_CONTRACT_ID_PREFIX}${encodeURIComponent(ref)}`;
}

function contractCoverageViolations(proposal: ProtocolSemanticProposal, expectedRefs: readonly string[]): string[] {
  const actual = proposal.contracts.map(({ ref }) => ref);
  const duplicates = [...new Set(actual.filter((ref, index) => actual.indexOf(ref) !== index))].sort();
  return [
    ...duplicates.map((ref) => `duplicate contract fragment: ${ref}`),
    ...expectedRefs.filter((ref) => !actual.includes(ref)).map((ref) => `missing contract fragment: ${ref}`),
    ...actual.filter((ref) => !expectedRefs.includes(ref)).map((ref) => `unexpected contract fragment: ${ref}`),
  ];
}

type ArtifactValidator = ReturnType<typeof createArtifactValidator>;

function addSharedSchemas(store: Store, validator: ArtifactValidator): void {
  const rows = store.db.prepare(`SELECT ac.ref, ac.schema_json FROM protocol_shared_schemas ps
    JOIN artifact_contracts ac ON ac.ref = ps.contract_ref ORDER BY ps.ordinal`).all();
  for (const row of rows) {
    const ref = stringColumn(row, 'ref');
    validator.addSchema(parseRecord(stringColumn(row, 'schema_json'), ref), ref);
  }
}

function addGeneratedSchemas(validator: ArtifactValidator, generated: Readonly<Record<string, JsonRecord>>, violations: string[]): void {
  for (const [ref, schema] of Object.entries(generated)) {
    try { validator.addSchema(schema, contractId(ref)); }
    catch (error: unknown) { violations.push(`${ref}: ${error instanceof Error ? error.message : String(error)}`); }
  }
}

function validateExamples(
  validator: ArtifactValidator,
  fragment: ProtocolContractFragment,
  packet: ProtocolWorkPacket,
  violations: string[],
): void {
  let validate;
  try {
    validate = validator.getSchema(contractId(fragment.ref));
  } catch (error: unknown) {
    violations.push(`${fragment.ref}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (validate === undefined) return;
  if (fragment.validExamples.length < packet.proposalRules.minimumValidExamplesPerContract) {
    violations.push(`${fragment.ref}: insufficient valid examples`);
  }
  if (fragment.invalidExamples.length < packet.proposalRules.minimumInvalidExamplesPerContract) {
    violations.push(`${fragment.ref}: insufficient invalid examples`);
  }
  const scaffold = packet.proposalRules.generatedScaffolds.find(({ ref }) => ref === fragment.ref);
  const withScaffold = (example: unknown): unknown => isRecord(example) ? { ...(scaffold?.exampleValues ?? {}), ...example } : example;
  fragment.validExamples.forEach((example, index) => {
    if (!validate(withScaffold(example))) violations.push(`${fragment.ref}: validExamples[${index}] is rejected`);
  });
  fragment.invalidExamples.forEach((example, index) => {
    if (validate(withScaffold(example))) violations.push(`${fragment.ref}: invalidExamples[${index}] is accepted`);
  });
}

function validateGeneratedSchemas(
  store: Store,
  proposal: ProtocolSemanticProposal,
  packet: ProtocolWorkPacket,
  generated: Readonly<Record<string, JsonRecord>>,
  violations: string[],
): void {
  const validator = createArtifactValidator();
  addSharedSchemas(store, validator);
  addGeneratedSchemas(validator, generated, violations);
  for (const fragment of proposal.contracts) validateExamples(validator, fragment, packet, violations);
}

function checkProtocolProposalForRefs(store: Store, value: unknown, expectedRefs: readonly string[]): ProtocolProposalCheck {
  const packet = compileProtocolWorkPacket(store);
  const violations: string[] = [];
  const proposal = parseProposal(value, violations);
  const generated: Record<string, JsonRecord> = {};
  if (proposal !== undefined) {
    if (proposal.workPacketId !== packet.id) violations.push(`proposal targets ${proposal.workPacketId}, expected ${packet.id}`);
    if (proposal.workPacketDigest !== packet.packetDigest) violations.push('proposal work packet digest does not match');
    violations.push(...contractCoverageViolations(proposal, expectedRefs));
    for (const fragment of proposal.contracts) generated[fragment.ref] = composeSchema(fragment, packet, violations);
    validateGeneratedSchemas(store, proposal, packet, generated, violations);
  }
  return { valid: violations.length === 0, violations, generatedContracts: generated };
}

export function checkProtocolProposal(store: Store, value: unknown): ProtocolProposalCheck {
  const packet = compileProtocolWorkPacket(store);
  return checkProtocolProposalForRefs(store, value, packet.proposalRules.exactContractRefs);
}

export function checkProtocolProposalBatch(
  store: Store,
  value: unknown,
  assignedRefs: readonly string[],
): ProtocolProposalCheck {
  const packet = compileProtocolWorkPacket(store);
  if (assignedRefs.length === 0) {
    return { valid: false, violations: ['assigned contract refs must not be empty'], generatedContracts: {} };
  }
  const assignmentViolations = contractCoverageViolations(
    { workPacketId: packet.id, workPacketDigest: packet.packetDigest, contracts: assignedRefs.map((ref) => ({
      ref, purpose: ref, payloadSchema: {}, semanticInvariants: [], mechanizationCandidates: [], validExamples: [], invalidExamples: [],
    })) },
    [...new Set(assignedRefs)],
  );
  const unknownRefs = assignedRefs.filter((ref) => !packet.proposalRules.exactContractRefs.includes(ref));
  const result = checkProtocolProposalForRefs(store, value, assignedRefs);
  const violations = [...assignmentViolations, ...unknownRefs.map((ref) => `assignment contains unknown contract: ${ref}`), ...result.violations];
  return { ...result, valid: violations.length === 0, violations };
}

function preParsedReceipt(value: unknown): StructuredOutputReceipt {
  return { rawOutputDigest: digest(value), normalization: STRUCTURED_OUTPUT_NORMALIZATION.PRE_PARSED };
}

export function evaluateAndPersistProtocolProposal(
  store: Store,
  value: unknown,
  authorSessionId: string,
  outputReceipt: StructuredOutputReceipt = preParsedReceipt(value),
): ProtocolProposalEvaluation {
  return evaluateAndPersistAssembledProtocolProposal(store, value, [authorSessionId], [], outputReceipt);
}

export function evaluateAndPersistAssembledProtocolProposal(
  store: Store,
  value: unknown,
  authorSessionIds: readonly string[],
  sourceBatchIds: readonly string[],
  outputReceipt: StructuredOutputReceipt = preParsedReceipt(value),
): ProtocolProposalEvaluation {
  const packet = compileProtocolWorkPacket(store);
  const result = checkProtocolProposal(store, value);
  const persistedValue = isRecord(value)
    ? { ...value, authorSessionIds: [...new Set(authorSessionIds)].sort(), sourceBatchIds: [...new Set(sourceBatchIds)].sort(), runtimeOutputReceipt: outputReceipt }
    : value;
  const proposalDigest = digest(persistedValue);
  const id = `protocol-proposal-${proposalDigest.slice(0, 16)}`;
  store.db.prepare(`INSERT OR IGNORE INTO protocol_proposals
    (id, work_packet_id, proposal_json, proposal_digest, valid, violations_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'evaluated', ?)`)
    .run(id, packet.id, canonicalJson(persistedValue), proposalDigest, result.valid ? 1 : 0,
      canonicalJson(result.violations), new Date().toISOString());
  return { ...result, proposalId: id, proposalDigest };
}

export function ingestProtocolProposalOutput(store: Store, raw: string, authorSessionId: string): ProtocolProposalEvaluation {
  const parsed = parseAgentJsonOutput(raw);
  return evaluateAndPersistProtocolProposal(store, parsed.value, authorSessionId, parsed.receipt);
}
