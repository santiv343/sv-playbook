import { eq } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { DATABASE_COLUMN } from '../db/schema-vocabulary.constants.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { CAPABILITY_EFFECT, CONTEXT_ERROR, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from './context.constants.js';
import { REFERENCE_VERSION_SEPARATOR } from '../platform.constants.js';
import { ContextError } from './context.errors.js';
import type { CapabilityEffect, ContextItemInput, ContextItemStatus, ContextItemStrength, StoredContextItem } from './context.types.js';
import type { ContextCatalog } from './repository.types.js';
import { contextPrecedence } from './schema.constants.js';

function refParts(ref: string): { id: string; version: number } {
  const separator = ref.lastIndexOf(REFERENCE_VERSION_SEPARATOR);
  const id = ref.slice(0, separator);
  const version = Number(ref.slice(separator + 1));
  if (separator < 1 || !Number.isInteger(version) || version < 1) {
    throw new ContextError('INVALID_REFERENCE', `invalid context reference: ${ref}`);
  }
  return { id, version };
}

type ContextSqlValue = string | number | null;
const BEGIN_WRITE = 'BEGIN IMMEDIATE';

function insertValues(store: Store, sql: string, values: readonly (readonly ContextSqlValue[])[]): void {
  const statement = store.db.prepare(sql);
  for (const value of values) statement.run(...value);
}

function itemRef(item: Pick<ContextItemInput, 'id' | 'version'>): string {
  return `${item.id}@${item.version}`;
}

function validateInput(item: ContextItemInput): void {
  const ref = itemRef(item);
  const required = [item.id, item.kind, item.semanticKey, item.body, item.provenance];
  if (required.some((value) => value.trim().length === 0)) {
    throw new ContextError('INVALID_ITEM', `${ref} contains an empty required field`);
  }
  if (!Number.isInteger(item.version) || item.version < 1) {
    throw new ContextError('INVALID_ITEM', `${ref} has an invalid version`);
  }
}

function validateSupersessions(store: Store, item: ContextItemInput, targets: readonly ReturnType<typeof refParts>[]): void {
  const statement = store.db.prepare('SELECT status, semantic_key FROM context_items WHERE id = ? AND version = ?');
  for (const target of targets) {
    const row = statement.get(target.id, target.version);
    if (row === undefined) {
      throw new ContextError(CONTEXT_ERROR.INVALID_SUPERSESSION, `${itemRef(item)} supersedes missing context item ${target.id}@${target.version}`);
    }
    if (stringColumn(row, 'status') !== CONTEXT_ITEM_STATUS.ACTIVE) {
      throw new ContextError(CONTEXT_ERROR.INVALID_SUPERSESSION, `${target.id}@${target.version} is not active`);
    }
    if (stringColumn(row, 'semantic_key') !== item.semanticKey) {
      throw new ContextError(CONTEXT_ERROR.INVALID_SUPERSESSION, `${target.id}@${target.version} has a different semantic key`);
    }
  }
}

function supersedeTargets(store: Store, targets: readonly ReturnType<typeof refParts>[], updatedAt: string): void {
  const statement = store.db.prepare('UPDATE context_items SET status = ?, updated_at = ? WHERE id = ? AND version = ?');
  for (const target of targets) {
    statement.run(CONTEXT_ITEM_STATUS.SUPERSEDED, updatedAt, target.id, target.version);
  }
}

// An item whose kind has no configured precedence poisons every compile
// (rankOf throws on it), so intake fails closed before the insert.
function validateKindPrecedence(store: Store, item: ContextItemInput): void {
  const row = store.orm.select({ kind: contextPrecedence.kind }).from(contextPrecedence)
    .where(eq(contextPrecedence.kind, item.kind)).get();
  if (row === undefined) {
    throw new ContextError(CONTEXT_ERROR.MISSING_PRECEDENCE, `no precedence configured for context kind ${item.kind}`);
  }
}

export function addContextItem(store: Store, item: ContextItemInput): void {
  validateInput(item);
  const now = new Date().toISOString();
  const tags = [...new Set(item.tags ?? [])].sort().map((tag) => [item.id, item.version, tag] as const);
  const selectors = Object.entries(item.selectors ?? {})
    .flatMap(([dimension, values]) => [...new Set(values)].sort().map((value) => [item.id, item.version, dimension, value] as const));
  const dependencies = (item.dependencies ?? []).map(refParts).map((dependency) => [item.id, item.version, dependency.id, dependency.version] as const);
  const supersessionTargets = (item.supersedes ?? []).map(refParts);
  const supersessions = supersessionTargets.map((target) => [item.id, item.version, target.id, target.version] as const);
  const capabilities = Object.entries(item.capabilities ?? {}).sort(([left], [right]) => left.localeCompare(right))
    .map(([capability, effect]) => [item.id, item.version, capability, effect] as const);

  store.db.exec(BEGIN_WRITE);
  try {
    validateKindPrecedence(store, item);
    validateSupersessions(store, item, supersessionTargets);
    store.db.prepare(`INSERT INTO context_items
      (id, version, kind, status, strength, semantic_key, body, provenance, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(item.id, item.version, item.kind, item.status, item.strength, item.semanticKey, item.body, item.provenance, now, now);
    insertValues(store, 'INSERT INTO context_item_tags VALUES (?, ?, ?)', tags);
    insertValues(store, 'INSERT INTO context_item_selectors VALUES (?, ?, ?, ?)', selectors);
    insertValues(store, 'INSERT INTO context_item_dependencies VALUES (?, ?, ?, ?)', dependencies);
    insertValues(store, 'INSERT INTO context_item_supersessions VALUES (?, ?, ?, ?)', supersessions);
    insertValues(store, 'INSERT INTO context_item_capabilities VALUES (?, ?, ?, ?)', capabilities);
    supersedeTargets(store, supersessionTargets, now);
    store.db.exec('COMMIT');
  } catch (error: unknown) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}

export function replaceContextPrecedence(store: Store, kinds: readonly string[]): void {
  const unique = [...new Set(kinds)];
  if (unique.length !== kinds.length || unique.some((kind) => kind.trim().length === 0)) {
    throw new ContextError('INVALID_PRECEDENCE', 'context precedence kinds must be unique non-empty values');
  }
  store.db.exec(BEGIN_WRITE);
  try {
    store.db.exec('DELETE FROM context_precedence');
    const statement = store.db.prepare('INSERT INTO context_precedence (kind, rank) VALUES (?, ?)');
    unique.forEach((kind, index) => { statement.run(kind, unique.length - index); });
    store.db.exec('COMMIT');
  } catch (error: unknown) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}

function groupedValues(store: Store, table: string, valueColumn: string): Map<string, string[]> {
  const rows = store.db.prepare(`SELECT item_id, item_version, ${valueColumn} FROM ${table} ORDER BY item_id, item_version, ${valueColumn}`).all();
  const result = new Map<string, string[]>();
  for (const row of rows) {
    const ref = `${stringColumn(row, 'item_id')}@${numberColumn(row, 'item_version')}`;
    const values = result.get(ref) ?? [];
    values.push(stringColumn(row, valueColumn));
    result.set(ref, values);
  }
  return result;
}

function loadSelectors(store: Store): Map<string, Record<string, string[]>> {
  const rows = store.db.prepare('SELECT item_id, item_version, dimension, value FROM context_item_selectors ORDER BY item_id, item_version, dimension, value').all();
  const result = new Map<string, Record<string, string[]>>();
  for (const row of rows) {
    const ref = `${stringColumn(row, 'item_id')}@${numberColumn(row, 'item_version')}`;
    const selectors = result.get(ref) ?? {};
    const dimension = stringColumn(row, 'dimension');
    const values = selectors[dimension] ?? [];
    values.push(stringColumn(row, 'value'));
    selectors[dimension] = values;
    result.set(ref, selectors);
  }
  return result;
}

function loadCapabilities(store: Store): Map<string, Record<string, CapabilityEffect>> {
  const rows = store.db.prepare('SELECT item_id, item_version, capability, effect FROM context_item_capabilities ORDER BY item_id, item_version, capability').all();
  const result = new Map<string, Record<string, CapabilityEffect>>();
  for (const row of rows) {
    const ref = `${stringColumn(row, 'item_id')}@${numberColumn(row, 'item_version')}`;
    const capabilities = result.get(ref) ?? {};
    capabilities[stringColumn(row, 'capability')] = parseCapabilityEffect(stringColumn(row, 'effect'));
    result.set(ref, capabilities);
  }
  return result;
}

function parseCapabilityEffect(value: string): CapabilityEffect {
  if (value === CAPABILITY_EFFECT.ALLOW || value === CAPABILITY_EFFECT.DENY) return value;
  throw new ContextError('INVALID_STORED_ITEM', `invalid stored capability effect: ${value}`);
}

function parseStatus(value: string): ContextItemStatus {
  for (const status of Object.values(CONTEXT_ITEM_STATUS)) {
    if (value === status) return status;
  }
  throw new ContextError('INVALID_STORED_ITEM', `invalid stored context status: ${value}`);
}

function parseStrength(value: string): ContextItemStrength {
  for (const strength of Object.values(CONTEXT_ITEM_STRENGTH)) {
    if (value === strength) return strength;
  }
  throw new ContextError('INVALID_STORED_ITEM', `invalid stored context strength: ${value}`);
}

function loadReferences(store: Store, table: string, prefix: string): Map<string, string[]> {
  const rows = store.db.prepare(`SELECT item_id, item_version, ${prefix}_id, ${prefix}_version FROM ${table} ORDER BY item_id, item_version, ${prefix}_id, ${prefix}_version`).all();
  const result = new Map<string, string[]>();
  for (const row of rows) {
    const ref = `${stringColumn(row, 'item_id')}@${numberColumn(row, 'item_version')}`;
    const values = result.get(ref) ?? [];
    values.push(`${stringColumn(row, `${prefix}_id`)}@${numberColumn(row, `${prefix}_version`)}`);
    result.set(ref, values);
  }
  return result;
}

export function loadContextCatalog(store: Store): ContextCatalog {
  const tags = groupedValues(store, 'context_item_tags', 'tag');
  const selectors = loadSelectors(store);
  const dependencies = loadReferences(store, 'context_item_dependencies', 'dependency');
  const supersedes = loadReferences(store, 'context_item_supersessions', 'superseded');
  const capabilities = loadCapabilities(store);
  const rows = store.db.prepare(`SELECT id, version, kind, status, strength, semantic_key, body, provenance,
    created_at, updated_at FROM context_items ORDER BY id, version`).all();
  const items: StoredContextItem[] = rows.map((row) => {
    const id = stringColumn(row, 'id');
    const version = numberColumn(row, 'version');
    const ref = `${id}@${version}`;
    return {
      id,
      version,
      kind: stringColumn(row, 'kind'),
      status: parseStatus(stringColumn(row, 'status')),
      strength: parseStrength(stringColumn(row, 'strength')),
      semanticKey: stringColumn(row, 'semantic_key'),
      body: stringColumn(row, 'body'),
      provenance: stringColumn(row, 'provenance'),
      tags: tags.get(ref) ?? [],
      selectors: selectors.get(ref) ?? {},
      dependencies: dependencies.get(ref) ?? [],
      supersedes: supersedes.get(ref) ?? [],
      capabilities: capabilities.get(ref) ?? {},
      createdAt: stringColumn(row, 'created_at'),
      updatedAt: stringColumn(row, 'updated_at'),
    };
  });
  const precedence: Record<string, number> = {};
  for (const row of store.db.prepare('SELECT kind, rank FROM context_precedence ORDER BY rank DESC').all()) {
    precedence[stringColumn(row, DATABASE_COLUMN.KIND)] = numberColumn(row, DATABASE_COLUMN.RANK);
  }
  return { items, precedence };
}
