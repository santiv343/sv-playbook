import { and, desc, eq } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { canonicalJson, digest } from '../context/digest.js';
import type { PacketDefinition } from '../packets/document.types.js';
import { packetDefinitions, packets } from './schema.constants.js';
import { STATUS } from './service.constants.js';
import {
  NO_WORK_DEFINITION_VERSION,
  WORK_DEFINITION_ERROR,
  WORK_DEFINITION_SCHEMA_VERSION,
  WORK_DEFINITION_VERSION_INCREMENT,
} from './work-definition.constants.js';
import { WorkDefinitionError } from './work-definition.errors.js';
import type { StoredWorkDefinition, WorkDefinitionReference, WorkDefinitionValue } from './work-definition.types.js';
import { REFERENCE_KIND, REFERENCE_MIN_ID_LENGTH, REFERENCE_MIN_VERSION, REFERENCE_SEPARATOR_WIDTH, REFERENCE_VERSION_SEPARATOR } from '../platform.constants.js';
import { WorkDefinitionValueSchema } from './work-definition.schema.constants.js';
import { parseJson } from '../schema/core.js';

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function workDefinitionValue(definition: PacketDefinition, body: string, type = ''): WorkDefinitionValue {
  return {
    schemaVersion: WORK_DEFINITION_SCHEMA_VERSION,
    id: definition.id,
    title: definition.title,
    body,
    type,
    dependsOn: uniqueSorted(definition.dependsOn),
    writeSet: uniqueSorted(definition.writeSet),
    requirements: [...definition.requirements],
    evidenceRequired: uniqueSorted(definition.evidenceRequired),
    tags: uniqueSorted(definition.tags ?? []),
  };
}

function parseValue(text: string): WorkDefinitionValue {
  try {
    return WorkDefinitionValueSchema.parse(parseJson(text));
  } catch {
    throw new WorkDefinitionError(
      WORK_DEFINITION_ERROR.INVALID_STORED_VALUE,
      'stored work definition does not conform to its schema',
    );
  }
}

function stored(row: typeof packetDefinitions.$inferSelect): StoredWorkDefinition {
  const value = parseValue(row.definitionJson);
  const actualDigest = digest(value);
  if (actualDigest !== row.definitionDigest || value.id !== row.packetId) {
    throw new WorkDefinitionError(
      WORK_DEFINITION_ERROR.DIGEST_MISMATCH,
      `work definition digest mismatch: ${row.packetId}@${row.version}`,
    );
  }
  return {
    reference: { kind: REFERENCE_KIND.WORK_DEFINITION, id: row.packetId, version: row.version, digest: row.definitionDigest },
    packetId: row.packetId,
    version: row.version,
    digest: row.definitionDigest,
    value,
    createdAt: row.createdAt,
  };
}

// Idempotente por digest: si el valor canónico (canonicalJson) da el mismo
// digest que la última versión guardada, no inserta fila nueva — devuelve la
// existente. Sólo incrementa versión cuando el contenido realmente cambió.
// Esto es lo que hace seguro llamar recordWorkDefinition repetidas veces
// (p.ej. desde amend.ts en cada rama) sin inflar el historial de versiones.
export function recordWorkDefinition(store: Store, value: WorkDefinitionValue): StoredWorkDefinition {
  const latest = store.orm.select().from(packetDefinitions)
    .where(eq(packetDefinitions.packetId, value.id))
    .orderBy(desc(packetDefinitions.version)).limit(1).get();
  const definitionDigest = digest(value);
  if (latest !== undefined && latest.definitionDigest === definitionDigest) return stored(latest);
  const version = (latest?.version ?? NO_WORK_DEFINITION_VERSION) + WORK_DEFINITION_VERSION_INCREMENT;
  const createdAt = new Date().toISOString();
  store.orm.insert(packetDefinitions).values({
    packetId: value.id,
    version,
    definitionDigest,
    definitionJson: canonicalJson(value),
    createdAt,
  }).run();
  return {
    reference: { kind: REFERENCE_KIND.WORK_DEFINITION, id: value.id, version, digest: definitionDigest },
    packetId: value.id, version, digest: definitionDigest, value, createdAt,
  };
}

export function loadWorkDefinition(store: Store, packetId: string): StoredWorkDefinition {
  const row = store.orm.select().from(packetDefinitions)
    .where(eq(packetDefinitions.packetId, packetId))
    .orderBy(desc(packetDefinitions.version)).limit(1).get();
  if (row === undefined) throw new WorkDefinitionError(WORK_DEFINITION_ERROR.UNKNOWN, `unknown work definition: ${packetId}`);
  return stored(row);
}

export function parseWorkDefinitionReference(ref: string): WorkDefinitionReference {
  const separator = ref.lastIndexOf(REFERENCE_VERSION_SEPARATOR);
  const packetId = ref.slice(0, separator);
  const version = Number(ref.slice(separator + REFERENCE_SEPARATOR_WIDTH));
  if (separator < REFERENCE_MIN_ID_LENGTH || !Number.isInteger(version) || version < REFERENCE_MIN_VERSION) {
    throw new WorkDefinitionError(WORK_DEFINITION_ERROR.INVALID_REFERENCE, `versioned work definition reference required: ${ref}`);
  }
  return { kind: REFERENCE_KIND.WORK_DEFINITION, id: packetId, version };
}

export function formatWorkDefinitionReference(reference: WorkDefinitionReference): string {
  return `${reference.id}@${reference.version}`;
}

export function resolveWorkDefinition(store: Store, reference: WorkDefinitionReference): StoredWorkDefinition {
  const packetId = reference.id;
  const version = reference.version;
  const row = store.orm.select().from(packetDefinitions).where(and(
    eq(packetDefinitions.packetId, packetId),
    eq(packetDefinitions.version, version),
  )).get();
  if (row === undefined) {
    const packet = store.orm.select({ id: packets.id }).from(packets).where(eq(packets.id, packetId)).get();
    const code = packet === undefined ? WORK_DEFINITION_ERROR.UNKNOWN : WORK_DEFINITION_ERROR.VERSION_NOT_FOUND;
    throw new WorkDefinitionError(code, `unknown work definition: ${formatWorkDefinitionReference(reference)}`);
  }
  return stored(row);
}

// "Eligible" agrega dos chequeos que resolveWorkDefinition solo no hace:
// que la versión referenciada sea la ÚLTIMA (STALE si no) y que el packet
// no esté en un estado terminal (DONE/DROPPED). Se usa donde una referencia
// vieja sería peligrosa (p.ej. armar un review-candidate contra un
// write_set que ya fue reemplazado por un amend posterior).
export function resolveEligibleWorkDefinition(store: Store, reference: WorkDefinitionReference): StoredWorkDefinition {
  const resolved = resolveWorkDefinition(store, reference);
  const latest = loadWorkDefinition(store, reference.id);
  if (latest.version !== reference.version) {
    throw new WorkDefinitionError(WORK_DEFINITION_ERROR.STALE, `stale work definition: ${formatWorkDefinitionReference(reference)}`);
  }
  const packet = store.orm.select({ status: packets.status }).from(packets).where(eq(packets.id, reference.id)).get();
  const status = packet?.status;
  if (status === STATUS.DONE || status === STATUS.DROPPED) {
    throw new WorkDefinitionError(
      WORK_DEFINITION_ERROR.STATUS_INELIGIBLE,
      `work definition is ${status}: ${formatWorkDefinitionReference(reference)}`,
    );
  }
  return resolved;
}
