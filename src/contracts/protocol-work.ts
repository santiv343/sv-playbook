import type { Store } from '../db/store.types.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import { ARTIFACT_CONTRACT_STATUS } from './artifact.constants.js';
import { addArtifactContract, createArtifactValidator } from './artifacts.js';
import { SELF_CORRECTION_MODE } from '../roles/role.constants.js';
import {
  JSON_SCHEMA_2020_12,
  PROPOSAL_FORBIDDEN_KEYWORDS,
  PROTOCOL_CONTRACT_ID_PREFIX,
  PROTOCOL_WORK_SCHEMA_VERSION,
  SHARED_PROTOCOL_DEFINITION,
} from './protocol-work.constants.js';
import type {
  ProtocolContractFact,
  ProtocolContractScaffold,
  ProtocolHandoffFact,
  ProtocolRoleFact,
  ProtocolSharedSchemaFact,
  ProtocolSupportInput,
  ProtocolWorkInspection,
  ProtocolWorkPacket,
} from './protocol-work.types.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(value: string, label: string): JsonRecord {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new ContextError('INVALID_PROTOCOL_DATA', `${label} must be an object`);
  return parsed;
}

function requiredString(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContextError('INVALID_PROTOCOL_DATA', `${label}.${key} must be a non-empty string`);
  }
  return value;
}

function strings(store: Store, sql: string, parameter?: string): string[] {
  const rows = parameter === undefined ? store.db.prepare(sql).all() : store.db.prepare(sql).all(parameter);
  return rows.map((row) => stringColumn(row, 'value'));
}

function loadRoles(store: Store): ProtocolRoleFact[] {
  return store.db.prepare(`SELECT rc.role_id, rc.input_contract_ref, rc.output_contract_ref,
    rc.minimum_model_capability, rc.context_item_id, rc.context_item_version, ci.body AS context_body,
    COALESCE(pd.self_correction_mode, '') AS self_correction_mode
    FROM role_contracts rc LEFT JOIN role_policy_declarations pd ON pd.role_id = rc.role_id
    JOIN context_items ci ON ci.id = rc.context_item_id AND ci.version = rc.context_item_version
    ORDER BY rc.role_id`).all().map((row) => {
    const roleId = stringColumn(row, 'role_id');
    const responsibilities = strings(store, 'SELECT responsibility_id AS value FROM role_responsibilities WHERE role_id = ? ORDER BY responsibility_id', roleId);
    const responsibilityDescriptions = Object.fromEntries(store.db.prepare(`SELECT r.id, r.description FROM role_responsibilities rr
      JOIN responsibilities r ON r.id = rr.responsibility_id WHERE rr.role_id = ? ORDER BY r.id`).all(roleId)
      .map((responsibility) => [stringColumn(responsibility, 'id'), stringColumn(responsibility, 'description')]));
    return {
      roleId,
      contextRef: `${stringColumn(row, 'context_item_id')}@${String(numberColumn(row, 'context_item_version'))}`,
      charter: stringColumn(row, 'context_body'),
      inputContractRef: stringColumn(row, 'input_contract_ref'),
      outputContractRef: stringColumn(row, 'output_contract_ref'),
      minimumModelCapability: stringColumn(row, 'minimum_model_capability'),
      responsibilities,
      responsibilityDescriptions,
      prohibitions: strings(store, 'SELECT operation_id AS value FROM role_prohibitions WHERE role_id = ? ORDER BY operation_id', roleId),
      selfCorrectionMode: stringColumn(row, 'self_correction_mode'),
      selfCorrectionScopes: strings(store, 'SELECT output_class AS value FROM role_self_correction_scopes WHERE role_id = ? ORDER BY output_class', roleId),
      stopConditions: strings(store, 'SELECT condition_id AS value FROM role_stop_conditions WHERE role_id = ? ORDER BY condition_id', roleId),
      escalationClasses: strings(store, 'SELECT class_id AS value FROM role_escalation_classes WHERE role_id = ? ORDER BY class_id', roleId),
    };
  });
}

function loadHandoffs(store: Store): ProtocolHandoffFact[] {
  return store.db.prepare(`SELECT source_role_id, target_role_id, artifact_contract_ref FROM role_handoffs
    ORDER BY source_role_id, target_role_id, artifact_contract_ref`).all().map((row) => ({
    sourceRoleId: stringColumn(row, 'source_role_id'),
    targetRoleId: stringColumn(row, 'target_role_id'),
    artifactContractRef: stringColumn(row, 'artifact_contract_ref'),
  }));
}

function contractFacts(roles: readonly ProtocolRoleFact[], handoffs: readonly ProtocolHandoffFact[]): ProtocolContractFact[] {
  const refs = new Set<string>();
  for (const role of roles) {
    refs.add(role.inputContractRef);
    refs.add(role.outputContractRef);
  }
  for (const handoff of handoffs) refs.add(handoff.artifactContractRef);
  return [...refs].sort().map((ref) => ({
    ref,
    inputForRoles: roles.filter((role) => role.inputContractRef === ref).map((role) => role.roleId),
    outputFromRoles: roles.filter((role) => role.outputContractRef === ref).map((role) => role.roleId),
    handoffs: handoffs.filter((handoff) => handoff.artifactContractRef === ref),
  }));
}

function loadSharedSchemas(store: Store): ProtocolSharedSchemaFact[] {
  return store.db.prepare(`SELECT ps.contract_ref, ac.schema_json, ac.schema_digest,
    am.metadata_schema_ref, am.metadata_digest
    FROM protocol_shared_schemas ps JOIN artifact_contracts ac ON ac.ref = ps.contract_ref
    JOIN artifact_contract_metadata am ON am.contract_ref = ps.contract_ref
    WHERE ac.status = 'active' ORDER BY ps.ordinal`).all().map((row) => {
    const ref = stringColumn(row, 'contract_ref');
    const schema = parseRecord(stringColumn(row, 'schema_json'), ref);
    const definitions = isRecord(schema.$defs) ? Object.keys(schema.$defs).sort() : [];
    return {
      ref,
      schema,
      schemaId: requiredString(schema, '$id', ref),
      schemaDigest: stringColumn(row, 'schema_digest'),
      metadataSchemaRef: stringColumn(row, 'metadata_schema_ref'),
      metadataDigest: stringColumn(row, 'metadata_digest'),
      definitions,
    };
  });
}

function escalationClasses(schema: JsonRecord): string[] {
  if (!isRecord(schema.$defs)) return [];
  const escalation = schema.$defs.escalation;
  if (!isRecord(escalation) || !isRecord(escalation.properties)) return [];
  const escalationClass = escalation.properties.escalation_class;
  if (!isRecord(escalationClass) || !Array.isArray(escalationClass.enum)) return [];
  return escalationClass.enum.filter((value): value is string => typeof value === 'string');
}

function roleSetViolations(store: Store, roles: readonly ProtocolRoleFact[]): string[] {
  const violations: string[] = [];
  const requiredRoles = strings(store, 'SELECT role_id AS value FROM required_roles ORDER BY role_id');
  const actualRoles = roles.map((role) => role.roleId);
  for (const role of requiredRoles.filter((role) => !actualRoles.includes(role))) violations.push(`missing required role: ${role}`);
  for (const role of actualRoles.filter((role) => !requiredRoles.includes(role))) violations.push(`role outside required catalog: ${role}`);
  if (requiredRoles.length === 0) violations.push('required role set is empty');
  return violations;
}

function allowedEscalations(shared: readonly ProtocolSharedSchemaFact[]): string[] {
  return [...new Set(shared.flatMap(({ schema }) => escalationClasses(schema)))].sort();
}

function unsupportedEscalations(roles: readonly ProtocolRoleFact[], allowed: readonly string[]): Array<{ roleId: string; classId: string }> {
  const allowedSet = new Set(allowed);
  return roles.flatMap((role) => role.escalationClasses
    .filter((classId) => !allowedSet.has(classId))
    .map((classId) => ({ roleId: role.roleId, classId })));
}

function escalationViolations(roles: readonly ProtocolRoleFact[], shared: readonly ProtocolSharedSchemaFact[]): string[] {
  if (shared.length === 0) return ['no active shared protocol schema is registered'];
  const allowed = allowedEscalations(shared);
  const violations = allowed.length === 0 ? ['shared protocol schemas do not define escalation classes'] : [];
  const unsupported = unsupportedEscalations(roles, allowed)
    .map(({ roleId, classId }) => `${roleId}: unsupported escalation class ${classId}`);
  return [...violations, ...unsupported];
}

function sourceViolations(store: Store, roles: readonly ProtocolRoleFact[], shared: readonly ProtocolSharedSchemaFact[]): string[] {
  const definitions = new Set(shared.flatMap(({ definitions }) => definitions));
  const missingDefinitions = Object.values(SHARED_PROTOCOL_DEFINITION)
    .filter((definition) => !definitions.has(definition))
    .map((definition) => `shared protocol schemas do not define ${definition}`);
  return [...roleSetViolations(store, roles), ...escalationViolations(roles, shared), ...missingDefinitions];
}

function sharedDefinitionRef(shared: readonly ProtocolSharedSchemaFact[], definition: string): string {
  const owner = shared.find(({ definitions }) => definitions.includes(definition));
  return owner === undefined ? `missing-shared-definition:${definition}` : `${owner.schemaId}#/$defs/${definition}`;
}

function contractScaffold(
  contract: ProtocolContractFact,
  roles: readonly ProtocolRoleFact[],
  shared: readonly ProtocolSharedSchemaFact[],
): ProtocolContractScaffold {
  const outputRoles = roles.filter((role) => contract.outputFromRoles.includes(role.roleId));
  const properties: Record<string, Readonly<Record<string, unknown>>> = {
    provenance: { $ref: sharedDefinitionRef(shared, SHARED_PROTOCOL_DEFINITION.PROVENANCE) },
  };
  const required = ['provenance'];
  const exampleValues: Record<string, unknown> = {
    provenance: {
      provenance_kind: 'agent-proposed', agent_role_id: 'fixture-role', session_id: 'fixture-session',
      timestamp: '2026-01-01T00:00:00.000Z', confirmed_by: null,
    },
  };
  if (outputRoles.length > 0) {
    properties.escalations = { type: 'array', items: { $ref: sharedDefinitionRef(shared, SHARED_PROTOCOL_DEFINITION.ESCALATION) } };
    required.push('escalations');
    exampleValues.escalations = [];
  }
  if (outputRoles.some(({ selfCorrectionMode }) => selfCorrectionMode === SELF_CORRECTION_MODE.BOUNDED)) {
    properties.corrections = { type: 'array', items: { $ref: sharedDefinitionRef(shared, SHARED_PROTOCOL_DEFINITION.CORRECTION_RECORD) } };
    required.push('corrections');
    exampleValues.corrections = [];
  }
  return { ref: contract.ref, properties, required, exampleValues };
}

// Compila TODO el protocolo actual (roles, handoffs, contratos,
// responsabilidades runtime, schemas compartidos) en un único paquete
// machine-readable — es el input que se le da a un agente encargado de
// PROPONER nuevos contratos/schemas (`proposalRules`: prefijos de ID
// permitidos, keywords prohibidas, mínimo de ejemplos válidos/inválidos
// por contrato). `sourceDigest`/`packetDigest` hacen que dos inspecciones
// del mismo estado del protocolo sean idénticas byte a byte — el mismo
// patrón de reproducibilidad que `compileContext` (flujo 5) y
// `dispatchRun`'s `RunSpec` (flujo 8).
function createPacket(store: Store): ProtocolWorkInspection {
  const roles = loadRoles(store);
  const handoffs = loadHandoffs(store);
  const contracts = contractFacts(roles, handoffs);
  const shared = loadSharedSchemas(store);
  const runtimeResponsibilities = strings(store, `SELECT r.id AS value FROM responsibilities r
    JOIN runtime_responsibilities rr ON rr.responsibility_id = r.id ORDER BY r.id`);
  const source = { roles, contracts, runtimeResponsibilities, sharedSchemas: shared };
  const sourceDigest = digest(source);
  const escalationClasses = allowedEscalations(shared);
  const sourceReconciliation = {
    allowedEscalationClasses: escalationClasses,
    unsupportedEscalations: unsupportedEscalations(roles, escalationClasses),
  };
  const proposalRules = {
    exactContractRefs: contracts.map(({ ref }) => ref),
    generatedSchemaDialect: JSON_SCHEMA_2020_12,
    generatedIdPrefix: PROTOCOL_CONTRACT_ID_PREFIX,
    allowedSharedRefs: shared.map(({ schemaId }) => schemaId),
    allowedSharedDefinitions: shared.flatMap(({ schemaId, definitions }) => definitions.map((name) => `${schemaId}#/$defs/${name}`)).sort(),
    forbiddenAgentKeywords: [...PROPOSAL_FORBIDDEN_KEYWORDS].sort(),
    propertyNamePattern: '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$',
    minimumValidExamplesPerContract: 1,
    minimumInvalidExamplesPerContract: 1,
    generatedScaffolds: contracts.map((contract) => contractScaffold(contract, roles, shared)),
  };
  const packetBody = { schemaVersion: PROTOCOL_WORK_SCHEMA_VERSION, sourceDigest, ...source, sourceReconciliation, proposalRules };
  const packetDigest = digest(packetBody);
  const packet: ProtocolWorkPacket = {
    id: `protocol-work-${packetDigest.slice(0, 16)}`,
    packetDigest,
    ...packetBody,
  };
  const violations = sourceViolations(store, roles, shared);
  return { packet, valid: violations.length === 0, violations };
}

export function inspectProtocolWorkPacket(store: Store): ProtocolWorkInspection {
  return createPacket(store);
}

export function persistProtocolWorkInspection(store: Store): ProtocolWorkInspection {
  const inspection = createPacket(store);
  const packet = inspection.packet;
  store.db.prepare(`INSERT OR IGNORE INTO protocol_work_packets
    (id, source_digest, packet_json, packet_digest, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(packet.id, packet.sourceDigest, canonicalJson(packet), packet.packetDigest, new Date().toISOString());
  return inspection;
}

// La variante que realmente se usa para despachar trabajo (a diferencia
// de `inspectProtocolWorkPacket`, de sólo diagnóstico): si el protocolo
// actual tiene violaciones internas (roles mal formados, escalaciones sin
// soporte, etc.), se rechaza ACÁ — nunca se le da a un agente un paquete
// de trabajo construido sobre una base ya inconsistente.
export function compileProtocolWorkPacket(store: Store): ProtocolWorkPacket {
  const inspection = createPacket(store);
  if (!inspection.valid) {
    throw new ContextError('INVALID_PROTOCOL_SOURCE', inspection.violations.join('; '));
  }
  persistProtocolWorkInspection(store);
  return inspection.packet;
}

export function registerProtocolSupport(store: Store, input: ProtocolSupportInput): void {
  const schemaRef = requiredString(input.schema, '$id', 'schema');
  const metadataSchemaRef = requiredString(input.metadataSchema, '$id', 'metadataSchema');
  const metadataTarget = requiredString(input.metadata, 'schema_id', 'metadata');
  if (metadataTarget !== schemaRef) {
    throw new ContextError('PROTOCOL_METADATA_MISMATCH', `metadata targets ${metadataTarget}, expected ${schemaRef}`);
  }
  const validator = createArtifactValidator();
  if (!validator.validateSchema(input.schema) || !validator.validateSchema(input.metadataSchema)) {
    throw new ContextError('INVALID_PROTOCOL_SUPPORT', validator.errorsText(validator.errors));
  }
  validator.addSchema(input.schema, schemaRef);
  const validateMetadata = validator.compile(input.metadataSchema);
  if (!validateMetadata(input.metadata)) {
    throw new ContextError('INVALID_PROTOCOL_SUPPORT', validator.errorsText(validateMetadata.errors));
  }
  store.db.exec('BEGIN IMMEDIATE');
  try {
    addArtifactContract(store, { ref: metadataSchemaRef, schema: input.metadataSchema, status: ARTIFACT_CONTRACT_STATUS.ACTIVE });
    addArtifactContract(store, { ref: schemaRef, schema: input.schema, status: ARTIFACT_CONTRACT_STATUS.ACTIVE });
    const ordinalRow = store.db.prepare('SELECT COALESCE(max(ordinal), -1) + 1 AS value FROM protocol_shared_schemas').get();
    const ordinal = ordinalRow === undefined || ordinalRow === null ? 0 : numberColumn(ordinalRow, 'value');
    store.db.prepare(`INSERT INTO artifact_contract_metadata
      (contract_ref, metadata_schema_ref, metadata_json, metadata_digest, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(schemaRef, metadataSchemaRef, canonicalJson(input.metadata), digest(input.metadata), new Date().toISOString());
    store.db.prepare('INSERT INTO protocol_shared_schemas (contract_ref, ordinal) VALUES (?, ?)').run(schemaRef, ordinal);
    store.db.exec('COMMIT');
  } catch (error: unknown) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}
