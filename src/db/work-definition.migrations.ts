import type Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { canonicalJson, digest } from '../context/digest.js';
import { parsePacketDocument } from '../packets/document.js';
import { REFERENCE_MIN_ID_LENGTH, REFERENCE_MIN_VERSION, REFERENCE_VERSION_SEPARATOR } from '../platform.constants.js';
import { WORK_DEFINITION_INITIAL_VERSION, WORK_DEFINITION_SCHEMA_VERSION } from '../tasks/work-definition.constants.js';
import { stringColumn } from './rows.js';
import { StoreVersionError } from './store.errors.js';
import { SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';
import { RUN_SPECS_TABLE } from './context.schema.constants.js';

function stringArrayColumn(row: unknown, key: string): string[] {
  const value: unknown = JSON.parse(stringColumn(row, key));
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new StoreVersionError(`cannot migrate invalid ${key}`);
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function legacySupplement(repoRoot: string, row: unknown): {
  requirements: readonly string[];
  evidenceRequired: readonly string[];
  tags: readonly string[];
} {
  const storedPath = stringColumn(row, 'path');
  const exportPath = isAbsolute(storedPath) ? storedPath : join(repoRoot, storedPath);
  if (!existsSync(exportPath)) return { requirements: [], evidenceRequired: [], tags: [] };
  const exported = parsePacketDocument(readFileSync(exportPath, 'utf8')).definition;
  const packetId = stringColumn(row, 'id');
  if (exported.id !== packetId) {
    throw new StoreVersionError(`cannot backfill ${packetId}: packet export identity mismatch`);
  }
  return {
    requirements: exported.requirements,
    evidenceRequired: [...new Set(exported.evidenceRequired)].sort(),
    tags: [...new Set(exported.tags ?? [])].sort(),
  };
}

function legacyWorkDefinition(
  db: Database.Database,
  repoRoot: string,
  row: unknown,
): Readonly<Record<string, unknown>> {
  const packetId = stringColumn(row, 'id');
  const dependencies = db.prepare('SELECT depends_on_id FROM packet_deps WHERE packet_id = ? ORDER BY depends_on_id')
    .all(packetId).map((dependency) => stringColumn(dependency, 'depends_on_id'));
  return {
    schemaVersion: WORK_DEFINITION_SCHEMA_VERSION,
    id: packetId,
    title: stringColumn(row, 'title'),
    body: stringColumn(row, 'body'),
    type: stringColumn(row, 'type'),
    dependsOn: dependencies,
    writeSet: stringArrayColumn(row, 'write_set'),
    ...legacySupplement(repoRoot, row),
  };
}

export function addVersionedWorkDefinitions(db: Database.Database, repoRoot: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS packet_definitions (
    packet_id TEXT NOT NULL REFERENCES packets(id),
    version INTEGER NOT NULL CHECK (version > 0),
    definition_digest TEXT NOT NULL,
    definition_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (packet_id, version),
    UNIQUE (packet_id, definition_digest)
  )`);
  migrateTableColumn(db, RUN_SPECS_TABLE, 'work_definition_ref', SQLITE_COLUMN_TYPE.TEXT, false);
  migrateTableColumn(db, RUN_SPECS_TABLE, 'work_definition_digest', SQLITE_COLUMN_TYPE.TEXT, false);
  const rows = db.prepare(`SELECT id, title, path, body, write_set, type, created_at
    FROM packets WHERE NOT EXISTS (
      SELECT 1 FROM packet_definitions WHERE packet_id = packets.id
    ) ORDER BY id`).all();
  const insert = db.prepare(`INSERT INTO packet_definitions
    (packet_id, version, definition_digest, definition_json, created_at) VALUES (?, ?, ?, ?, ?)`);
  for (const row of rows) {
    const value = legacyWorkDefinition(db, repoRoot, row);
    insert.run(
      stringColumn(row, 'id'),
      WORK_DEFINITION_INITIAL_VERSION,
      digest(value),
      canonicalJson(value),
      stringColumn(row, 'created_at'),
    );
  }
}

function parseLegacyReference(ref: string): { id: string; version: number } {
  const separator = ref.lastIndexOf(REFERENCE_VERSION_SEPARATOR);
  const version = Number(ref.slice(separator + REFERENCE_MIN_ID_LENGTH));
  if (separator < REFERENCE_MIN_ID_LENGTH || !Number.isInteger(version) || version < REFERENCE_MIN_VERSION) {
    throw new StoreVersionError(`cannot migrate invalid work definition reference: ${ref}`);
  }
  return { id: ref.slice(0, separator), version };
}

export function addTypedRunSpecReferences(db: Database.Database): void {
  migrateTableColumn(db, RUN_SPECS_TABLE, 'work_definition_id', SQLITE_COLUMN_TYPE.TEXT, false);
  migrateTableColumn(db, RUN_SPECS_TABLE, 'work_definition_version', SQLITE_COLUMN_TYPE.INTEGER, false);
  migrateTableColumn(db, RUN_SPECS_TABLE, 'workflow_effect_id', 'TEXT REFERENCES workflow_effects(id)', false);
  const rows = db.prepare(`SELECT id, work_definition_ref FROM run_specs
    WHERE work_definition_ref IS NOT NULL AND work_definition_id IS NULL`).all();
  const updateWork = db.prepare(`UPDATE run_specs SET work_definition_id = ?, work_definition_version = ? WHERE id = ?`);
  for (const row of rows) {
    const reference = parseLegacyReference(stringColumn(row, 'work_definition_ref'));
    updateWork.run(reference.id, reference.version, stringColumn(row, 'id'));
  }
  db.exec(`UPDATE run_specs SET workflow_effect_id = dispatch_ref
    WHERE workflow_effect_id IS NULL AND EXISTS (
      SELECT 1 FROM workflow_effects WHERE workflow_effects.id = run_specs.dispatch_ref
    )`);
}
