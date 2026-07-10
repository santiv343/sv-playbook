import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { numberColumn, stringColumn } from './rows.js';
import { DB_FILE, SCHEMA, SCHEMA_VERSION, SVP_DIR } from './store.constants.js';
import { StoreVersionError } from './store.errors.js';
import { createStateBackup } from './backup.js';
import { BACKUP_REASON } from './backup.constants.js';
import { LEASE_TTL_MS } from '../tasks/service.constants.js';
import type { Store } from './store.types.js';

export function commonRoot(startDir: string): string {
  const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: startDir,
    encoding: 'utf8',
  }).trim();
  return dirname(resolve(startDir, out));
}

export function worktreeRoot(startDir: string): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: startDir, encoding: 'utf8' }).trim();
}

function applyPragmas(db: DatabaseSync): void {
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
}

interface OpenStoreOptions {
  skipVersionCheck?: boolean;
}

function migrateBodyColumn(db: DatabaseSync): void {
  const cols = db.prepare("SELECT name FROM pragma_table_info('packets') WHERE name = 'body'").all();
  if (cols.length === 0) {
    db.exec('ALTER TABLE packets ADD COLUMN body TEXT NOT NULL DEFAULT \'\'');
  }
}

function migratePrColumn(db: DatabaseSync): void {
  const cols = db.prepare("SELECT name FROM pragma_table_info('packets') WHERE name = 'pr'").all();
  if (cols.length === 0) {
    db.exec('ALTER TABLE packets ADD COLUMN pr TEXT');
  }
}

function migrateTypeColumn(db: DatabaseSync): void {
  const cols = db.prepare("SELECT name FROM pragma_table_info('packets') WHERE name = 'type'").all();
  if (cols.length === 0) {
    db.exec("ALTER TABLE packets ADD COLUMN type TEXT NOT NULL DEFAULT ''");
  }
}

const TABLES_SQL = "SELECT name FROM sqlite_master WHERE type='table'";

function migrateConstitutionTables(db: DatabaseSync): void {
  const tables = new Set(
    db.prepare(TABLES_SQL)
      .all()
      .map((row) => stringColumn(row, 'name')),
  );
  if (!tables.has('constitution_sections')) {
    db.exec(`
      CREATE TABLE constitution_sections (
        section TEXT PRIMARY KEY,
        body TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }
  if (!tables.has('constitution_principles')) {
    db.exec(`
      CREATE TABLE constitution_principles (
        id TEXT PRIMARY KEY,
        rule TEXT NOT NULL,
        rationale TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL
      )
    `);
  }
}

function migrateSprintsTables(db: DatabaseSync): void {
  const tables = new Set(
    db.prepare(TABLES_SQL)
      .all()
      .map((row) => stringColumn(row, 'name')),
  );
  if (!tables.has('sprints')) {
    db.exec(`
      CREATE TABLE sprints (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL DEFAULT '',
        budget_cap REAL NOT NULL DEFAULT 0,
        wip_limit INTEGER,
        state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
        created_at TEXT NOT NULL,
        closed_at TEXT
      )
    `);
  }
  if (!tables.has('sprint_tasks')) {
    db.exec(`
      CREATE TABLE sprint_tasks (
        sprint_id TEXT NOT NULL REFERENCES sprints(id),
        packet_id TEXT NOT NULL REFERENCES packets(id),
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (sprint_id, packet_id)
      )
    `);
  }
  if (!tables.has('task_costs')) {
    db.exec(`
      CREATE TABLE task_costs (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        packet_id TEXT NOT NULL REFERENCES packets(id),
        amount REAL NOT NULL,
        recorded_by TEXT,
        recorded_at TEXT NOT NULL
      )
    `);
  }
}

export function openStore(repoRoot: string, options?: OpenStoreOptions): Store {
  const dir = join(repoRoot, SVP_DIR);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, DB_FILE);
  const isNew = !existsSync(dbPath);
  const db = new DatabaseSync(dbPath);
  applyPragmas(db);
  db.exec(SCHEMA);
  if (isNew) {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (!options?.skipVersionCheck) {
    const row = db.prepare('PRAGMA user_version').get();
    const currentVersion = numberColumn(row, 'user_version');
    if (currentVersion === 3) {
      migrateBodyColumn(db);
      db.exec('PRAGMA user_version = 4');
      migrateTypeColumn(db);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    } else if (currentVersion === 4) {
      migrateTypeColumn(db);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    } else if (currentVersion === 5) {
      migrateConstitutionTables(db);
      migrateSprintsTables(db);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    } else if (currentVersion === 6) {
      migrateSprintsTables(db);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    } else if (currentVersion !== SCHEMA_VERSION) {
      db.close();
      throw new StoreVersionError(
        `store unusable (schema v${currentVersion} does not match v${SCHEMA_VERSION}): restore a verified backup with 'restore state --file <snap>' (primary), or 'rebuild' from git (last resort) — never delete .svp`,
      );
    }
  }
  migratePrColumn(db);
  return { db, dir, close: () => { db.close(); } };
}

interface MigrateStoreOptions {
  currentSessionId?: string;
}

export function migrateStore(repoRoot: string, options?: MigrateStoreOptions): void {
  const dbPath = join(repoRoot, SVP_DIR, DB_FILE);
  const backup = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL, allowFreshLeases: true });

  const expectedSha = backup.sha256;
  const actualSha = createHash('sha256').update(readFileSync(backup.sqlitePath)).digest('hex');
  if (actualSha !== expectedSha) {
    throw new Error('migration aborted: pre-migration backup verification failed (sha256 mismatch)');
  }
  const vacDb = new DatabaseSync(backup.sqlitePath);
  const integrityRow = vacDb.prepare('PRAGMA integrity_check').get();
  const integrityCheck = stringColumn(integrityRow, 'integrity_check');
  vacDb.close();
  if (integrityCheck !== 'ok') {
    throw new Error('migration aborted: pre-migration backup verification failed (integrity check)');
  }

  const liveDb = new DatabaseSync(dbPath);
  const leaseRows = liveDb.prepare('SELECT session_id, heartbeat_at FROM leases').all();
  liveDb.close();
  const currentSessionId = options?.currentSessionId;
  let foreignCount = 0;
  for (const row of leaseRows) {
    const sid = stringColumn(row, 'session_id');
    if (currentSessionId !== undefined && sid === currentSessionId) continue;
    const hb = stringColumn(row, 'heartbeat_at');
    if (Date.now() - Date.parse(hb) <= LEASE_TTL_MS) {
      foreignCount++;
    }
  }
  if (foreignCount > 0) {
    throw new Error(
      `migration blocked: ${foreignCount} other worktree/session(s) are live on the shared store — pause them or isolate state per worktree before migrating`,
    );
  }

  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  db.close();
}
