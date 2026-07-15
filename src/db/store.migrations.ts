import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createStateBackup } from './backup.js';
import { BACKUP_REASON } from './backup.constants.js';
import type { BackupReason } from './backup.types.js';
import { numberColumn, stringColumn } from './rows.js';
import { DEFAULT_GIT_BRANCH, DB_FILE, EVENT_COMMANDS, EVENT_SCHEMA_MIGRATED, SCHEMA, SCHEMA_VERSION, SQLITE_INTEGRITY_OK, STORE_TABLE, SVP_DIR, sqlInList } from './store.constants.js';
import { StoreVersionError } from './store.errors.js';
import { pendingMigrationIds } from './store.migration-manifest.js';
import type { StoreMigrationId } from './store.migration-manifest.types.js';
import { STORE_MIGRATION_ID } from './store.migration-manifest.constants.js';
import type { MigrateStoreOptions, OpenStoreOptions } from './store.types.js';
import { LEASE_TTL_MS } from '../tasks/service.constants.js';
import { ORCHESTRATION_STORE_SCHEMA } from './orchestration.schema.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';
import { addModelCapabilityEvaluations, addReviewCandidates, addRoleProjectionReceipts, addSemanticRoleContractFields, addTypedRunSpecReferences, addVersionedRoleCatalog, addVersionedWorkDefinitions } from './store.migration-functions.js';
import { applyExclusiveStorePragmas, readStoreSchemaVersion } from './store.pragmas.js';
import { STORE_PRAGMA } from './store.pragmas.constants.js';

const TABLES_SQL = "SELECT name FROM sqlite_master WHERE type='table'";
const beginImmediateSql = 'BEGIN IMMEDIATE';
const insertSchemaMigratedSql = 'INSERT INTO events (command, at) VALUES (?, ?)';

function getCurrentBranch(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function isOnDefaultBranch(repoRoot: string): boolean {
  const branch = getCurrentBranch(repoRoot);
  if (branch === '' || branch === DEFAULT_GIT_BRANCH.MAIN || branch === DEFAULT_GIT_BRANCH.LEGACY) return true;
  try {
    const remoteRef = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    return branch === remoteRef.replace('refs/remotes/origin/', '');
  } catch {
    return false;
  }
}

export function migratePacketColumn(
  db: Database.Database,
  column: string,
  type: string,
  notNull: boolean,
  defaultValue?: string,
): void {
  migrateTableColumn(db, 'packets', column, type, notNull, defaultValue);
}

function tableNames(db: Database.Database): ReadonlySet<string> {
  return new Set(db.prepare(TABLES_SQL).all().map((row) => stringColumn(row, 'name')));
}

function migrateConstitutionTables(db: Database.Database): void {
  const tables = tableNames(db);
  if (!tables.has(STORE_TABLE.CONSTITUTION_SECTIONS)) {
    db.exec(`CREATE TABLE constitution_sections (
      section TEXT PRIMARY KEY,
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  }
  if (!tables.has(STORE_TABLE.CONSTITUTION_PRINCIPLES)) {
    db.exec(`CREATE TABLE constitution_principles (
      id TEXT PRIMARY KEY,
      rule TEXT NOT NULL,
      rationale TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL
    )`);
  }
}

function migrateSprintsTables(db: Database.Database): void {
  const tables = tableNames(db);
  if (!tables.has(STORE_TABLE.SPRINTS)) {
    db.exec(`CREATE TABLE sprints (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL DEFAULT '',
      budget_cap REAL NOT NULL DEFAULT 0,
      wip_limit INTEGER,
      state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
      created_at TEXT NOT NULL,
      closed_at TEXT
    )`);
  }
  if (!tables.has(STORE_TABLE.SPRINT_TASKS)) {
    db.exec(`CREATE TABLE sprint_tasks (
      sprint_id TEXT NOT NULL REFERENCES sprints(id),
      packet_id TEXT NOT NULL REFERENCES packets(id),
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sprint_id, packet_id)
    )`);
  }
  if (!tables.has(STORE_TABLE.TASK_COSTS)) {
    db.exec(`CREATE TABLE task_costs (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      packet_id TEXT NOT NULL REFERENCES packets(id),
      amount REAL NOT NULL,
      recorded_by TEXT,
      recorded_at TEXT NOT NULL
    )`);
  }
}

function migrateEventsTable(db: Database.Database): void {
  const eventCheck = `command TEXT NOT NULL CHECK (command IN (${sqlInList(EVENT_COMMANDS)}))`;
  db.exec(`CREATE TABLE events_new (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    packet_id TEXT,
    ${eventCheck},
    detail TEXT,
    at TEXT NOT NULL
  )`);
  db.exec('INSERT INTO events_new (seq, session_id, packet_id, command, detail, at) SELECT seq, session_id, packet_id, command, detail, at FROM events');
  db.exec('DROP TABLE events');
  db.exec('ALTER TABLE events_new RENAME TO events');
}

function tableColumnExists(db: Database.Database, table: string, column: string): boolean {
  return db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, column) !== undefined;
}

function migratePacketContentColumns(db: Database.Database): void {
  migratePacketColumn(db, 'body', 'TEXT', true, "''");
  migratePacketColumn(db, 'type', 'TEXT', true, "''");
}

function migrateConstitutionAndSprints(db: Database.Database): void {
  migrateConstitutionTables(db);
  migrateSprintsTables(db);
}

function removeRoleRouteTables(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS role_escalation_routes');
  db.exec('DROP TABLE IF EXISTS role_correction_policies');
}

function removeRoleEscalationTables(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS role_escalations');
  if (tableColumnExists(db, 'role_contracts', 'correction_policy')) {
    db.exec('ALTER TABLE role_contracts DROP COLUMN correction_policy');
  }
}

function removeDispatchSessions(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS dispatch_sessions');
}

function addProtocolProposalStatus(db: Database.Database): void {
  if (!tableColumnExists(db, 'protocol_proposals', 'status')) {
    db.exec("ALTER TABLE protocol_proposals ADD COLUMN status TEXT NOT NULL DEFAULT 'evaluated' CHECK (status IN ('evaluated', 'approved', 'rejected', 'applied'))");
  }
}

function addGatewayObservationInterval(db: Database.Database): void {
  if (!tableColumnExists(db, 'execution_profiles', 'observation_interval_ms')) {
    db.exec('ALTER TABLE execution_profiles ADD COLUMN observation_interval_ms INTEGER NOT NULL DEFAULT 10000 CHECK (observation_interval_ms > 0)');
  }
}

function noVersionSpecificMigration(): void {}

function addDurableWorkflowCoordinator(db: Database.Database): void {
  db.exec(ORCHESTRATION_STORE_SCHEMA);
  migrateTableColumn(db, 'run_specs', 'input_artifact_id', 'TEXT REFERENCES workflow_artifacts(id)', false);
}

function addWorkflowRuntimeConfiguration(db: Database.Database): void {
  db.exec(ORCHESTRATION_STORE_SCHEMA);
}

function addRunSpecDispatchRef(db: Database.Database): void {
  migrateTableColumn(db, 'run_specs', 'dispatch_ref', 'TEXT', true, "''");
  db.exec("UPDATE run_specs SET dispatch_ref = task_ref WHERE dispatch_ref = ''");
}

function profileSnapshot(db: Database.Database, profileId: string): string {
  const row = db.prepare(`SELECT id, role_id, adapter_id, agent_id, provider_id, model_id, variant,
    adapter_config_json, observation_interval_ms, no_progress_timeout_ms, cancellation_grace_ms, enabled
    FROM execution_profiles WHERE id = ?`).get(profileId);
  if (typeof row !== 'object' || row === null) {
    throw new StoreVersionError(`cannot snapshot missing execution profile: ${profileId}`);
  }
  const rowRecord: Record<string, unknown> = Object.fromEntries(Object.entries(row));
  const adapterConfig: unknown = JSON.parse(stringColumn(rowRecord, 'adapter_config_json'));
  const tools = Object.fromEntries(db.prepare(`SELECT tool_id, enabled FROM execution_profile_tools
    WHERE profile_id = ? ORDER BY tool_id`).all(profileId)
    .map((tool) => [stringColumn(tool, 'tool_id'), numberColumn(tool, 'enabled') === 1]));
  const snapshot: Record<string, unknown> = {
    id: stringColumn(rowRecord, 'id'),
    roleId: stringColumn(rowRecord, 'role_id'),
    adapterId: stringColumn(rowRecord, 'adapter_id'),
    agentId: stringColumn(rowRecord, 'agent_id'),
    providerId: stringColumn(rowRecord, 'provider_id'),
    modelId: stringColumn(rowRecord, 'model_id'),
    adapterConfig,
    observationIntervalMs: numberColumn(rowRecord, 'observation_interval_ms'),
    noProgressTimeoutMs: numberColumn(rowRecord, 'no_progress_timeout_ms'),
    cancellationGraceMs: numberColumn(rowRecord, 'cancellation_grace_ms'),
    tools,
    enabled: numberColumn(rowRecord, 'enabled') === 1,
  };
  const variant = rowRecord.variant;
  if (typeof variant === 'string') snapshot.variant = variant;
  return JSON.stringify(snapshot);
}

function addRunSpecProfileSnapshot(db: Database.Database): void {
  migrateTableColumn(db, 'run_specs', 'execution_profile_json', 'TEXT', true, "'{}'");
  const rows = db.prepare('SELECT id, execution_profile_id FROM run_specs').all();
  const update = db.prepare('UPDATE run_specs SET execution_profile_json = ? WHERE id = ?');
  for (const row of rows) {
    update.run(profileSnapshot(db, stringColumn(row, 'execution_profile_id')), stringColumn(row, 'id'));
  }
}

function addRunSpecDispatchIdentity(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS run_dispatches (
    dispatch_ref TEXT NOT NULL, role_id TEXT NOT NULL, phase TEXT NOT NULL,
    task_ref TEXT NOT NULL, run_spec_id TEXT NOT NULL UNIQUE REFERENCES run_specs(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (dispatch_ref, role_id, phase)
  )`);
  db.exec(`INSERT OR IGNORE INTO run_dispatches
    (dispatch_ref, role_id, phase, task_ref, run_spec_id, created_at)
    SELECT dispatch_ref, role_id, phase, task_ref, id, created_at FROM run_specs ORDER BY created_at, id`);
}

type StoreMigration = (db: Database.Database, repoRoot: string) => void;

const migrations = {
  'packet-content-columns': migratePacketContentColumns,
  'packet-type-column': (db: Database.Database): void => { migratePacketColumn(db, 'type', 'TEXT', true, "''"); },
  'constitution-and-sprints': migrateConstitutionAndSprints,
  'sprints': migrateSprintsTables,
  'event-commands-1': migrateEventsTable,
  'event-commands-2': migrateEventsTable,
  'event-commands-3': migrateEventsTable,
  'schema-11': noVersionSpecificMigration,
  'schema-12': noVersionSpecificMigration,
  'schema-13': noVersionSpecificMigration,
  'schema-14': noVersionSpecificMigration,
  'remove-role-route-tables': removeRoleRouteTables,
  'remove-role-escalation-tables': removeRoleEscalationTables,
  'remove-dispatch-sessions': removeDispatchSessions,
  'schema-18': noVersionSpecificMigration,
  'schema-19': noVersionSpecificMigration,
  'protocol-proposal-status': addProtocolProposalStatus,
  'protocol-proposal-batches': noVersionSpecificMigration,
  'gateway-run-observation': addGatewayObservationInterval,
  'durable-workflow-coordinator': addDurableWorkflowCoordinator,
  'workflow-runtime-configuration': addWorkflowRuntimeConfiguration,
  'run-spec-dispatch-ref': addRunSpecDispatchRef,
  'run-spec-profile-snapshot': addRunSpecProfileSnapshot,
  'run-spec-dispatch-identity': addRunSpecDispatchIdentity,
  [STORE_MIGRATION_ID.VERSIONED_WORK_DEFINITIONS]: addVersionedWorkDefinitions,
  [STORE_MIGRATION_ID.TYPED_RUN_SPEC_REFERENCES]: addTypedRunSpecReferences,
  [STORE_MIGRATION_ID.VERSIONED_ROLE_CATALOG]: addVersionedRoleCatalog,
  [STORE_MIGRATION_ID.ROLE_PROJECTION_RECEIPTS]: addRoleProjectionReceipts,
  [STORE_MIGRATION_ID.SEMANTIC_ROLE_CONTRACTS]: addSemanticRoleContractFields,
  [STORE_MIGRATION_ID.MODEL_CAPABILITY_EVALUATIONS]: addModelCapabilityEvaluations,
  [STORE_MIGRATION_ID.REVIEW_CANDIDATES]: addReviewCandidates,
} satisfies Readonly<Record<StoreMigrationId, StoreMigration>>;

function runVersionMigration(db: Database.Database, repoRoot: string, fromVersion: number): void {
  const pendingIds = pendingMigrationIds(fromVersion);
  if (pendingIds.length === 0) throw new StoreVersionError(`no migration path from schema v${fromVersion}`);
  for (const migrationId of pendingIds) migrations[migrationId](db, repoRoot);
  db.exec(`${STORE_PRAGMA.USER_VERSION} = ${SCHEMA_VERSION}`);
}

function createVerifiedBackup(repoRoot: string, reason: BackupReason): void {
  const backup = createStateBackup(repoRoot, { reason, allowFreshLeases: true });
  const actualDigest = createHash('sha256').update(readFileSync(backup.sqlitePath)).digest('hex');
  if (backup.sha256 !== actualDigest) throw new Error('pre-migration backup verification failed (sha256 mismatch)');
  const backupDb = new Database(backup.sqlitePath, { readonly: true });
  const integrityCheck = stringColumn(backupDb.prepare('PRAGMA integrity_check').get(), 'integrity_check');
  backupDb.close();
  if (integrityCheck !== SQLITE_INTEGRITY_OK) throw new Error('pre-migration backup verification failed (integrity check)');
}

function assertMigrationBranch(repoRoot: string, migrateLive: boolean | undefined): void {
  if (isOnDefaultBranch(repoRoot)) return;
  const branch = getCurrentBranch(repoRoot);
  if (migrateLive) {
    console.error(`bypassing branch guard: migrating live from "${branch}"`);
    return;
  }
  throw new StoreVersionError(`migration refused: on branch "${branch}" which is not the default branch - switch to main or pass --migrate-live to migrate the live store from this branch`);
}

function performMigration(db: Database.Database, repoRoot: string, currentVersion: number, options?: OpenStoreOptions): void {
  try {
    assertMigrationBranch(repoRoot, options?.migrateLive);
  } catch (error: unknown) {
    db.close();
    throw error;
  }
  createVerifiedBackup(repoRoot, BACKUP_REASON.STORE_OPEN);
  db.exec(beginImmediateSql);
  try {
    runVersionMigration(db, repoRoot, currentVersion);
    db.prepare(insertSchemaMigratedSql).run(EVENT_SCHEMA_MIGRATED, new Date().toISOString());
    db.exec('COMMIT');
  } catch (error: unknown) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const tooNewText = (currentVersion: number): string =>
  `store unusable (schema v${currentVersion} does not match v${SCHEMA_VERSION}): a migration PR is likely open or just merged - git pull and retry. Restore a verified backup with 'restore state --file <snap>' (primary), or 'rebuild' from git (last resort) - never delete .svp`;

export function checkVersionAndMigrate(
  db: Database.Database,
  repoRoot: string,
  options?: OpenStoreOptions,
): void {
  const currentVersion = readStoreSchemaVersion(db);
  if (currentVersion >= 3 && currentVersion < SCHEMA_VERSION) {
    performMigration(db, repoRoot, currentVersion, options);
    return;
  }
  if (currentVersion === SCHEMA_VERSION) return;
  db.close();
  throw new StoreVersionError(tooNewText(currentVersion));
}

function assertNoForeignLeases(dbPath: string, currentSessionId?: string): void {
  const liveDb = new Database(dbPath);
  const leaseRows = liveDb.prepare('SELECT session_id, heartbeat_at FROM leases').all();
  liveDb.close();
  const foreignCount = leaseRows.filter((row) => {
    const sessionId = stringColumn(row, 'session_id');
    const belongsToCaller = currentSessionId !== undefined && sessionId === currentSessionId;
    const fresh = Date.now() - Date.parse(stringColumn(row, 'heartbeat_at')) <= LEASE_TTL_MS;
    return !belongsToCaller && fresh;
  }).length;
  if (foreignCount > 0) {
    throw new Error(`migration blocked: ${foreignCount} other worktree/session(s) are live on the shared store - pause them or isolate state per worktree before migrating`);
  }
}

export function migrateStore(repoRoot: string, options?: MigrateStoreOptions): void {
  assertMigrationBranch(repoRoot, options?.migrateLive);
  const dbPath = join(repoRoot, SVP_DIR, DB_FILE);
  createVerifiedBackup(repoRoot, BACKUP_REASON.MANUAL);
  assertNoForeignLeases(dbPath, options?.currentSessionId);
  const db = new Database(dbPath);
  try {
    applyExclusiveStorePragmas(db);
    db.exec(SCHEMA);
    const currentVersion = readStoreSchemaVersion(db);
    db.exec(beginImmediateSql);
    try {
      runVersionMigration(db, repoRoot, currentVersion);
      db.prepare(insertSchemaMigratedSql).run(EVENT_SCHEMA_MIGRATED, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error: unknown) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}
