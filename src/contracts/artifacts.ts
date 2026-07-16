import { Ajv2020 } from 'ajv/dist/2020.js';
import { createRequire } from 'node:module';
import type { FormatsPlugin } from 'ajv-formats';
import type { Store } from '../db/store.types.js';
import { stringColumn } from '../db/rows.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { ArtifactContractCheck, ArtifactContractInput } from './artifact.types.js';
import { ARTIFACT_CONTRACT_ERROR, JSON_SCHEMA_TOKEN } from './artifact.constants.js';

const importedFormats: unknown = createRequire(import.meta.url)('ajv-formats');

function isFormatsPlugin(value: unknown): value is FormatsPlugin {
  return typeof value === 'function';
}

if (!isFormatsPlugin(importedFormats)) throw new TypeError('ajv-formats did not export a plugin');
const addFormats = importedFormats;

export function createArtifactValidator(): InstanceType<typeof Ajv2020> {
  const validator = new Ajv2020({ strict: true, allErrors: true });
  addFormats(validator, { mode: 'full' });
  return validator;
}

function parseRecord(text: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContextError('INVALID_ARTIFACT_CONTRACT', `${label} must be a JSON object`);
  }
  return Object.fromEntries(Object.entries(value));
}

export function addArtifactContract(store: Store, contract: ArtifactContractInput): void {
  if (contract.ref.trim().length === 0) throw new ContextError('INVALID_ARTIFACT_CONTRACT', 'contract ref is required');
  const schemaJson = canonicalJson(contract.schema);
  const schemaValidator = createArtifactValidator();
  if (!schemaValidator.validateSchema(contract.schema)) {
    throw new ContextError(
      'INVALID_ARTIFACT_CONTRACT',
      `${contract.ref}: ${schemaValidator.errorsText(schemaValidator.errors)}`,
    );
  }
  store.db.prepare(`INSERT INTO artifact_contracts
    (ref, schema_json, schema_digest, status, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(contract.ref, schemaJson, digest(contract.schema), contract.status, new Date().toISOString());
}

function activeSchemas(store: Store): ReadonlyArray<{ ref: string; schema: Record<string, unknown> }> {
  return store.db.prepare("SELECT ref, schema_json FROM artifact_contracts WHERE status = 'active' ORDER BY ref").all()
    .map((row) => ({
      ref: stringColumn(row, 'ref'),
      schema: parseRecord(stringColumn(row, 'schema_json'), stringColumn(row, 'ref')),
    }));
}

function schemaId(schema: Readonly<Record<string, unknown>>): string | undefined {
  return typeof schema.$id === 'string' && schema.$id.length > 0 ? schema.$id : undefined;
}

function referencedSchemaIds(value: unknown, result: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) referencedSchemaIds(item, result);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === JSON_SCHEMA_TOKEN.REFERENCE_KEY && typeof child === 'string' && !child.startsWith(JSON_SCHEMA_TOKEN.FRAGMENT)) {
      result.add(child.split(JSON_SCHEMA_TOKEN.FRAGMENT, 1)[0] ?? child);
    } else {
      referencedSchemaIds(child, result);
    }
  }
}

function contractDependencies(
  root: Readonly<Record<string, unknown>>,
  schemasById: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): Readonly<Record<string, unknown>>[] {
  const pending = new Set<string>();
  const visited = new Set<string>();
  const result: Readonly<Record<string, unknown>>[] = [];
  referencedSchemaIds(root, pending);
  while (pending.size > 0) {
    const id = [...pending].sort()[0];
    if (id === undefined) break;
    pending.delete(id);
    if (visited.has(id)) continue;
    const schema = schemasById.get(id);
    if (schema === undefined) throw new ContextError('INVALID_ARTIFACT_CONTRACT', `unresolved schema dependency: ${id}`);
    visited.add(id);
    result.push(schema);
    referencedSchemaIds(schema, pending);
  }
  return result;
}

function definitions(schema: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const value = schema.$defs;
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContextError('INVALID_ARTIFACT_CONTRACT', 'schema $defs must be an object');
  }
  return Object.fromEntries(Object.entries(value));
}

function mergedDefinitions(
  root: Readonly<Record<string, unknown>>,
  dependencies: readonly Readonly<Record<string, unknown>>[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...definitions(root) };
  for (const dependency of dependencies) {
    for (const [name, definition] of Object.entries(definitions(dependency))) {
      const existing = result[name];
      if (existing !== undefined && canonicalJson(existing) !== canonicalJson(definition)) {
        throw new ContextError('INVALID_ARTIFACT_CONTRACT', `conflicting schema definition: ${name}`);
      }
      result[name] = definition;
    }
  }
  return result;
}

function localizeReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(localizeReferences);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key !== JSON_SCHEMA_TOKEN.REFERENCE_KEY || typeof child !== 'string' || child.startsWith(JSON_SCHEMA_TOKEN.FRAGMENT)) {
      return [key, localizeReferences(child)];
    }
    const separator = child.indexOf(JSON_SCHEMA_TOKEN.FRAGMENT);
    const fragment = separator < 0 ? '' : child.slice(separator + 1);
    if (!fragment.startsWith(JSON_SCHEMA_TOKEN.DEFINITIONS_FRAGMENT)) {
      throw new ContextError('INVALID_ARTIFACT_CONTRACT', `unsupported external schema reference: ${child}`);
    }
    return [key, `${JSON_SCHEMA_TOKEN.FRAGMENT}${fragment}`];
  }));
}

export function resolvedArtifactSchema(store: Store, ref: string): Readonly<Record<string, unknown>> {
  const schemas = activeSchemas(store);
  const root = schemas.find((entry) => entry.ref === ref)?.schema;
  if (root === undefined) throw new ContextError(ARTIFACT_CONTRACT_ERROR.UNKNOWN_CONTRACT, `unknown active artifact contract: ${ref}`);
  const schemasById = new Map(schemas.flatMap((entry) => {
    const id = schemaId(entry.schema);
    return id === undefined ? [] : [[id, entry.schema] as const];
  }));
  const dependencies = contractDependencies(root, schemasById);
  const localized = localizeReferences({ ...root, $defs: mergedDefinitions(root, dependencies) });
  if (typeof localized !== 'object' || localized === null || Array.isArray(localized)) {
    throw new ContextError('INVALID_ARTIFACT_CONTRACT', `resolved schema must be an object: ${ref}`);
  }
  return Object.fromEntries(Object.entries(localized));
}

function addSchemas(
  validator: InstanceType<typeof Ajv2020>,
  schemas: ReadonlyArray<{ ref: string; schema: Record<string, unknown> }>,
): string[] {
  const violations: string[] = [];
  for (const { ref, schema } of schemas) {
    try {
      validator.addSchema(schema, ref);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      violations.push(`${ref}: ${detail}`);
    }
  }
  return violations;
}

function resolveSchemas(
  validator: InstanceType<typeof Ajv2020>,
  schemas: ReadonlyArray<{ ref: string; schema: Record<string, unknown> }>,
): string[] {
  const violations: string[] = [];
  for (const { ref } of schemas) {
    try {
      if (validator.getSchema(ref) === undefined) violations.push(`${ref}: schema did not compile`);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      violations.push(`${ref}: ${detail}`);
    }
  }
  return violations;
}

function roleReferenceViolations(store: Store, activeRefs: ReadonlySet<string>): string[] {
  const violations: string[] = [];
  for (const row of store.db.prepare(`SELECT role_id, input_contract_ref, output_contract_ref
    FROM role_contracts ORDER BY role_id`).all()) {
    const roleId = stringColumn(row, 'role_id');
    for (const field of ['input_contract_ref', 'output_contract_ref'] as const) {
      const ref = stringColumn(row, field);
      if (!activeRefs.has(ref)) violations.push(`${roleId}: unresolved ${field} ${ref}`);
    }
  }
  return violations;
}

function handoffReferenceViolations(store: Store, activeRefs: ReadonlySet<string>): string[] {
  const violations: string[] = [];
  for (const row of store.db.prepare('SELECT source_role_id, artifact_contract_ref FROM role_handoffs ORDER BY source_role_id').all()) {
    const ref = stringColumn(row, 'artifact_contract_ref');
    if (!activeRefs.has(ref)) {
      violations.push(`${stringColumn(row, 'source_role_id')}: unresolved handoff contract ${ref}`);
    }
  }
  return violations;
}

export function checkArtifactContracts(store: Store): ArtifactContractCheck {
  const schemas = activeSchemas(store);
  const activeRefs = new Set(schemas.map(({ ref }) => ref));
  const validator = createArtifactValidator();
  const violations = [
    ...addSchemas(validator, schemas),
    ...resolveSchemas(validator, schemas),
    ...roleReferenceViolations(store, activeRefs),
    ...handoffReferenceViolations(store, activeRefs),
  ];
  return { valid: violations.length === 0, violations };
}

export function validateArtifact(store: Store, ref: string, artifact: unknown): void {
  const schemas = activeSchemas(store);
  if (!schemas.some((schema) => schema.ref === ref)) {
    throw new ContextError(ARTIFACT_CONTRACT_ERROR.UNKNOWN_CONTRACT, `unknown active artifact contract: ${ref}`);
  }
  const validator = createArtifactValidator();
  const violations = [...addSchemas(validator, schemas), ...resolveSchemas(validator, schemas)];
  if (violations.length > 0) {
    throw new ContextError(ARTIFACT_CONTRACT_ERROR.INVALID_CONTRACT, violations.join('; '));
  }
  const validate = validator.getSchema(ref);
  if (validate === undefined) throw new ContextError(ARTIFACT_CONTRACT_ERROR.INVALID_CONTRACT, `${ref}: schema did not compile`);
  if (!validate(artifact)) {
    throw new ContextError(ARTIFACT_CONTRACT_ERROR.CONTRACT_VIOLATION, `${ref}: ${validator.errorsText(validate.errors)}`);
  }
}
