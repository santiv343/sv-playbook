import type { Store } from '../db/store.types.js';
import { stringColumn } from '../db/rows.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import { ARTIFACT_CONTRACT_STATUS } from './artifact.constants.js';
import { addArtifactContract, createArtifactValidator } from './artifacts.js';
import type { EscalationVocabularyAddition } from './protocol-reconciliation.types.js';

type JsonRecord = Record<string, unknown>;
const SHARED_SCHEMA_LABEL = 'shared schema';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(text: string, label: string): JsonRecord {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new ContextError('INVALID_PROTOCOL_DATA', `${label} must be an object`);
  return value;
}

function versionBump(id: string): string {
  const match = /^(.*:)(\d+)\.(\d+)\.(\d+)$/.exec(id);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    throw new ContextError('UNVERSIONED_PROTOCOL_SCHEMA', `cannot derive next minor version from ${id}`);
  }
  return `${match[1]}${match[2]}.${Number(match[3]) + 1}.0`;
}

function replaceExactStrings(value: unknown, replacements: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const [current, next] of replacements) result = result.replaceAll(current, next);
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => replaceExactStrings(item, replacements));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceExactStrings(child, replacements)]));
}

function escalationEnum(schema: JsonRecord): unknown[] {
  if (!isRecord(schema.$defs)) throw new ContextError('INVALID_PROTOCOL_SCHEMA', 'shared schema has no $defs');
  const escalation = schema.$defs.escalation;
  if (!isRecord(escalation) || !isRecord(escalation.properties)) {
    throw new ContextError('INVALID_PROTOCOL_SCHEMA', 'shared schema has no escalation properties');
  }
  const escalationClass = escalation.properties.escalation_class;
  if (!isRecord(escalationClass) || !Array.isArray(escalationClass.enum)) {
    throw new ContextError('INVALID_PROTOCOL_SCHEMA', 'shared schema has no escalation enum');
  }
  return escalationClass.enum;
}

function evolveSchema(schema: JsonRecord, nextId: string, additions: readonly EscalationVocabularyAddition[]): JsonRecord {
  const evolved = parseRecord(canonicalJson(schema), SHARED_SCHEMA_LABEL);
  evolved.$id = nextId;
  const values = escalationEnum(evolved);
  for (const addition of additions) values.push(addition.classId);
  return evolved;
}

interface EvolutionSource {
  sharedRef: string;
  sharedSchema: JsonRecord;
  metadataSchemaRef: string;
  metadataSchema: JsonRecord;
  metadata: JsonRecord;
}

// ⚠️ Ver findings.md F-011: este archivo usa store.db.prepare (SQL crudo)
// para SELECT/INSERT/UPDATE en tablas de negocio (protocol_shared_schemas,
// artifact_contracts, artifact_contract_metadata) — no es DDL. La
// convención del resto del código (store.orm siempre, SQL crudo sólo en
// src/db para DDL/migraciones) se rompe acá.
function source(store: Store): EvolutionSource {
  const rows = store.db.prepare(`SELECT ps.contract_ref, shared.schema_json AS shared_schema_json,
    am.metadata_schema_ref, metadata_schema.schema_json AS metadata_schema_json, am.metadata_json
    FROM protocol_shared_schemas ps JOIN artifact_contracts shared ON shared.ref = ps.contract_ref
    JOIN artifact_contract_metadata am ON am.contract_ref = ps.contract_ref
    JOIN artifact_contracts metadata_schema ON metadata_schema.ref = am.metadata_schema_ref
    ORDER BY ps.ordinal`).all();
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new ContextError('AMBIGUOUS_PROTOCOL_SCHEMA', `expected one shared protocol schema, found ${rows.length}`);
  }
  const row = rows[0];
  return {
    sharedRef: stringColumn(row, 'contract_ref'),
    sharedSchema: parseRecord(stringColumn(row, 'shared_schema_json'), SHARED_SCHEMA_LABEL),
    metadataSchemaRef: stringColumn(row, 'metadata_schema_ref'),
    metadataSchema: parseRecord(stringColumn(row, 'metadata_schema_json'), 'metadata schema'),
    metadata: parseRecord(stringColumn(row, 'metadata_json'), 'metadata'),
  };
}

function validateEvolution(shared: JsonRecord, metadataSchema: JsonRecord, metadata: JsonRecord): void {
  const validator = createArtifactValidator();
  if (!validator.validateSchema(shared) || !validator.validateSchema(metadataSchema)) {
    throw new ContextError('INVALID_PROTOCOL_EVOLUTION', validator.errorsText(validator.errors));
  }
  validator.addSchema(shared, String(shared.$id));
  const validateMetadata = validator.compile(metadataSchema);
  if (!validateMetadata(metadata)) {
    throw new ContextError('INVALID_PROTOCOL_EVOLUTION', validator.errorsText(validateMetadata.errors));
  }
}

// Evolucionar el vocabulario de escalación (agregar una escalationClass
// nueva) NUNCA edita el schema compartido en el lugar — versionBump() exige
// que el $id actual siga el patrón `algo:MAJOR.MINOR.PATCH` y arma uno
// nuevo con minor+1; el schema viejo se marca 'retired' (no se borra) y
// todo lo que lo referenciaba se re-apunta al nuevo ref. Es el mismo
// principio "aditivo, no destructivo" que managed-contracts.ts, aplicado a
// una porción del schema en vez de al contrato completo.
export function evolveProtocolVocabulary(store: Store, additions: readonly EscalationVocabularyAddition[]): void {
  if (additions.length === 0) return;
  const current = source(store);
  const nextSharedRef = versionBump(current.sharedRef);
  const nextMetadataSchemaRef = versionBump(current.metadataSchemaRef);
  const nextShared = evolveSchema(current.sharedSchema, nextSharedRef, additions);
  const replacements = new Map([[current.sharedRef, nextSharedRef], [current.metadataSchemaRef, nextMetadataSchemaRef]]);
  const metadataSchemaValue = replaceExactStrings(current.metadataSchema, replacements);
  const metadataValue = replaceExactStrings(current.metadata, replacements);
  if (!isRecord(metadataSchemaValue) || !isRecord(metadataValue)) throw new ContextError('INVALID_PROTOCOL_EVOLUTION', 'evolved metadata is invalid');
  validateEvolution(nextShared, metadataSchemaValue, metadataValue);
  addArtifactContract(store, { ref: nextMetadataSchemaRef, schema: metadataSchemaValue, status: ARTIFACT_CONTRACT_STATUS.ACTIVE });
  addArtifactContract(store, { ref: nextSharedRef, schema: nextShared, status: ARTIFACT_CONTRACT_STATUS.ACTIVE });
  store.db.prepare(`INSERT INTO artifact_contract_metadata
    (contract_ref, metadata_schema_ref, metadata_json, metadata_digest, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(nextSharedRef, nextMetadataSchemaRef, canonicalJson(metadataValue), digest(metadataValue), new Date().toISOString());
  store.db.prepare('UPDATE protocol_shared_schemas SET contract_ref = ? WHERE contract_ref = ?').run(nextSharedRef, current.sharedRef);
  store.db.prepare(`UPDATE artifact_contracts SET status = 'retired' WHERE ref IN (?, ?)`).run(current.sharedRef, current.metadataSchemaRef);
}
