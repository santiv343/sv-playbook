import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { numberColumn, stringColumn } from './rows.js';
import { DB_FILE, EVENT_COMMANDS, EVENT_SCHEMA_MIGRATED, SCHEMA, SCHEMA_VERSION, SVP_DIR, WORKTREE_DAEMON_REQUIRED_TEXT, sqlInList } from './store.constants.js';
import { StoreVersionError } from './store.errors.js';
import { createStateBackup } from './backup.js';
import { BACKUP_REASON } from './backup.constants.js';
import type { BackupReason } from './backup.types.js';
import { LEASE_TTL_MS } from '../tasks/service.constants.js';
import type { Store } from './store.types.js';

const GIT_COMMON_DIR_ARGS = ['rev-parse', '--git-common-dir'];
const GIT_TOPLEVEL_ARGS = ['rev-parse', '--show-toplevel'];

export function commonRoot(startDir: string): string {
  const out = execFileSync('git', GIT_COMMON_DIR_ARGS, { cwd: startDir, encoding: 'utf8' }).trim();
  return dirname(resolve(startDir, out));
}

export function worktreeRoot(startDir: string): string {
  return execFileSync('git', GIT_TOPLEVEL_ARGS, { cwd: startDir, encoding: 'utf8' }).trim();
}

// ── Daemon client (worktree → daemon forwarding) ──
const DAEMON_LOCK_FILE = '.svp-daemon.lock';
const DAEMON_TOKEN_FILE = '.svp-daemon-token';
const DAEMON_DEFAULT_PORT = 4141;

function execGitCommonDir(s: string): string {
  return execFileSync('git', GIT_COMMON_DIR_ARGS, { cwd: s, encoding: 'utf8' }).trim();
}

function execGitTopLevel(s: string): string {
  return execFileSync('git', GIT_TOPLEVEL_ARGS, { cwd: s, encoding: 'utf8' }).trim();
}

export function isWorktree(s: string): boolean {
  try { return dirname(resolve(s, execGitCommonDir(s))) !== execGitTopLevel(s); }
  catch { return false; }
}

export function isDaemonRunning(repoRoot: string): boolean {
  const lockPath = join(repoRoot, SVP_DIR, DAEMON_LOCK_FILE);
  if (!existsSync(lockPath)) return false;
  try {
    const pid = Number(readFileSync(lockPath, 'utf8').trim().split('\n')[0]);
    if (Number.isNaN(pid)) return false;
    try { process.kill(pid, 0); return true; }
    catch { unlinkSync(lockPath); return false; }
  } catch { return false; }
}

export function readDaemonToken(repoRoot: string): string | null {
  const p = join(repoRoot, SVP_DIR, DAEMON_TOKEN_FILE);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf8').trim().split('\n')[0] ?? null; }
  catch { return null; }
}

export function blessedRoot(s: string): string | null {
  try { return dirname(resolve(s, execGitCommonDir(s))); }
  catch { return null; }
}

function forwardToDaemonSync(argv: string[], token: string, port: number): number {
  const body = JSON.stringify({ token, argv });
  const bl = Buffer.byteLength(body);
  const sc = `const http=require('http');const b=${JSON.stringify(body)};const r=http.request({hostname:'127.0.0.1',port:${port},method:'POST',path:'/api/v1/exec',timeout:10000,headers:{'Content-Type':'application/json','Content-Length':${bl}}},s=>{let d='';s.setEncoding('utf8');s.on('data',c=>{d+=c;});s.on('end',()=>{try{const p=JSON.parse(d);if(p.stdout)process.stdout.write(p.stdout);if(p.stderr)process.stderr.write(p.stderr);process.exit(typeof p.exitCode==='number'?p.exitCode:1);}catch{process.exit(1);}});});r.on('error',()=>process.exit(1));r.on('timeout',()=>{r.destroy();process.exit(1);});r.end(b);`;
  try {
    execFileSync(process.execPath, ['-e', sc], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 15000, env: { ...process.env, SV_PLAYBOOK_DAEMON: '1' } });
    return 0;
  } catch { return 1; }
}

function tryAutoForward(): void {
  try {
    const cwd = process.cwd();
    if (!isWorktree(cwd)) return;
    const br = blessedRoot(cwd);
    if (br === null) return;
    const args = process.argv.slice(2);
    if (args[0] === 'daemon') return;
    if (!isDaemonRunning(br)) {
      console.error(WORKTREE_DAEMON_REQUIRED_TEXT);
      process.exit(1);
      return;
    }
    const token = readDaemonToken(br);
    if (token === null) return;
    process.exit(forwardToDaemonSync(args, token, DAEMON_DEFAULT_PORT));
  } catch { /* proceed with direct mode */ }
}

if (!process.env.SV_PLAYBOOK_DAEMON && !process.env.NODE_TEST_CONTEXT) {
  tryAutoForward();
}

function getCurrentBranch(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function isOnDefaultBranch(repoRoot: string): boolean {
  const branch = getCurrentBranch(repoRoot);
  if (branch === '' || branch === 'main' || branch === 'master') return true;
  try {
    const remoteRef = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    return branch === remoteRef.replace('refs/remotes/origin/', '');
  } catch { return false; }
}

function applyPragmas(db: DatabaseSync): void {
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
}

interface OpenStoreOptions {
  skipVersionCheck?: boolean;
  migrateLive?: boolean;
}

const MIGRATION_REFUSED_TEXT = (branch: string): string =>
  `migration refused: on branch "${branch}" which is not the default branch — switch to main or pass --migrate-live to migrate the live store from this branch`;

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

function runVersionMigration(db: DatabaseSync, fromVersion: number): void {
  if (fromVersion === 3) {
    migrateBodyColumn(db);
    db.exec('PRAGMA user_version = 4');
    migrateTypeColumn(db);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (fromVersion === 4) {
    migrateTypeColumn(db);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (fromVersion === 5) {
    migrateConstitutionTables(db);
    migrateSprintsTables(db);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (fromVersion === 6) {
    migrateSprintsTables(db);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (fromVersion === 7) {
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
    db.exec('PRAGMA user_version = 8');
  }
}

function emitSchemaMigrated(db: DatabaseSync): void {
  try {
    db.prepare('INSERT INTO events (command, at) VALUES (?, ?)').run(EVENT_SCHEMA_MIGRATED, new Date().toISOString());
  } catch (err) {
    console.error(`failed to emit schema-migrated event: ${String(err)}`);
  }
}

function createVerifiedBackup(repoRoot: string, reason: BackupReason): void {
  const backup = createStateBackup(repoRoot, { reason, allowFreshLeases: true });
  const expectedSha = backup.sha256;
  const actualSha = createHash('sha256').update(readFileSync(backup.sqlitePath)).digest('hex');
  if (actualSha !== expectedSha) {
    throw new Error('pre-migration backup verification failed (sha256 mismatch)');
  }
  const vacDb = new DatabaseSync(backup.sqlitePath);
  const integrityRow = vacDb.prepare('PRAGMA integrity_check').get();
  const integrityCheck = stringColumn(integrityRow, 'integrity_check');
  vacDb.close();
  if (integrityCheck !== 'ok') {
    throw new Error('pre-migration backup verification failed (integrity check)');
  }
}

const TOO_NEW_TEXT = (currentVersion: number): string =>
  `store unusable (schema v${currentVersion} does not match v${SCHEMA_VERSION}): a migration PR is likely open or just merged — git pull and retry. Restore a verified backup with 'restore state --file <snap>' (primary), or 'rebuild' from git (last resort) — never delete .svp`;

function performMigration(db: DatabaseSync, repoRoot: string, currentVersion: number, options?: OpenStoreOptions): void {
  if (!isOnDefaultBranch(repoRoot)) {
    if (options?.migrateLive) {
      console.error(`bypassing branch guard: migrating live from "${getCurrentBranch(repoRoot)}"`);
    } else {
      db.close();
      throw new StoreVersionError(MIGRATION_REFUSED_TEXT(getCurrentBranch(repoRoot)));
    }
  }
  createVerifiedBackup(repoRoot, BACKUP_REASON.STORE_OPEN);
  runVersionMigration(db, currentVersion);
  emitSchemaMigrated(db);
}

function assertStoreNotHeldByDaemon(repoRoot: string): void {
  if (process.env.SV_PLAYBOOK_DAEMON) return;
  if (isDaemonRunning(repoRoot)) {
    throw new StoreVersionError(
      `store is held by the daemon — run commands from the blessed root or start the daemon with \`sv-playbook daemon\``,
    );
  }
  if (!process.env.NODE_TEST_CONTEXT && isWorktree(process.cwd())) {
    const br = blessedRoot(process.cwd());
    if (br !== null && !isDaemonRunning(br)) {
      throw new StoreVersionError(WORKTREE_DAEMON_REQUIRED_TEXT);
    }
  }
}

function checkVersionAndMigrate(db: DatabaseSync, repoRoot: string, options?: OpenStoreOptions): void {
  const row = db.prepare('PRAGMA user_version').get();
  const currentVersion = numberColumn(row, 'user_version');

  if (currentVersion >= 3 && currentVersion < SCHEMA_VERSION) {
    performMigration(db, repoRoot, currentVersion, options);
  } else if (currentVersion !== SCHEMA_VERSION) {
    db.close();
    throw new StoreVersionError(TOO_NEW_TEXT(currentVersion));
  }
}

export function openStore(repoRoot: string, options?: OpenStoreOptions): Store {
  assertStoreNotHeldByDaemon(repoRoot);
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
    checkVersionAndMigrate(db, repoRoot, options);
  }
  migratePrColumn(db);
  return { db, dir, close: () => { db.close(); } };
}

interface MigrateStoreOptions {
  currentSessionId?: string;
  migrateLive?: boolean;
}

function assertNoForeignLeases(dbPath: string, currentSessionId?: string): void {
  const liveDb = new DatabaseSync(dbPath);
  const leaseRows = liveDb.prepare('SELECT session_id, heartbeat_at FROM leases').all();
  liveDb.close();
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
}

export function migrateStore(repoRoot: string, options?: MigrateStoreOptions): void {
  const dbPath = join(repoRoot, SVP_DIR, DB_FILE);

  if (!isOnDefaultBranch(repoRoot)) {
    if (options?.migrateLive) {
      console.error(`bypassing branch guard: migrating live from "${getCurrentBranch(repoRoot)}"`);
    } else {
      throw new StoreVersionError(MIGRATION_REFUSED_TEXT(getCurrentBranch(repoRoot)));
    }
  }

  createVerifiedBackup(repoRoot, BACKUP_REASON.MANUAL);

  assertNoForeignLeases(dbPath, options?.currentSessionId);

  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  emitSchemaMigrated(db);
  db.close();
}
