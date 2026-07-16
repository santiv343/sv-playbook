import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { stringColumn } from './rows.js';
import { DB_FILE, NODE_TEST_CONTEXT_ENV, SCHEMA, SCHEMA_VERSION, STORE_PROCESS_KIND, SVP_DIR, WORKTREE_DAEMON_REQUIRED_TEXT } from './store.constants.js';
import { GIT_ARGUMENT } from '../git.constants.js';
import { OS_PLATFORM } from '../platform.constants.js';
import { getCwd } from '../runtime/context.js';
import { StoreVersionError } from './store.errors.js';
import { DAEMON_DEFAULT_PORT, DAEMON_LOCK_FILE, DAEMON_TOKEN_FILE } from '../daemon/daemon.constants.js';
import { forwardToDaemonSync } from '../daemon/client.js';
import type { OpenStoreOptions, Store } from './store.types.js';
import { checkVersionAndMigrate, migratePacketColumn } from './store.migrations.js';
import { SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { createStoreOrm } from './orm.js';
import { applyExclusiveStorePragmas, applyReadOnlyStorePragmas, readStoreSchemaVersion } from './store.pragmas.js';
import { STORE_PRAGMA } from './store.pragmas.constants.js';

export { migrateStore } from './store.migrations.js';

const GIT_COMMON_DIR_ARGS = [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.GIT_COMMON_DIR];
const GIT_TOPLEVEL_ARGS = [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.SHOW_TOPLEVEL];

export function commonRoot(startDir: string): string {
  const out = execFileSync('git', GIT_COMMON_DIR_ARGS, { cwd: startDir, encoding: 'utf8' }).trim();
  return dirname(resolve(startDir, out));
}

export function worktreeRoot(startDir: string): string {
  return execFileSync('git', GIT_TOPLEVEL_ARGS, { cwd: startDir, encoding: 'utf8' }).trim();
}

// ── Daemon client (worktree → daemon forwarding) ──
function execGitCommonDir(s: string): string {
  return execFileSync('git', GIT_COMMON_DIR_ARGS, { cwd: s, encoding: 'utf8' }).trim();
}

function execGitTopLevel(s: string): string {
  return execFileSync('git', GIT_TOPLEVEL_ARGS, { cwd: s, encoding: 'utf8' }).trim();
}

// git prints forward-slash paths while node:path resolves to backslashes on
// win32 — normalize both sides (separators and drive-letter case) before
// comparing, or every repo root is misclassified as a worktree on Windows.
function normalizePathForCompare(p: string): string {
  return process.platform === OS_PLATFORM.WINDOWS ? resolve(p).toLowerCase() : resolve(p);
}

export function isWorktree(s: string): boolean {
  try { return normalizePathForCompare(dirname(resolve(s, execGitCommonDir(s)))) !== normalizePathForCompare(execGitTopLevel(s)); }
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
  try {
    const commonDir = resolve(s, execGitCommonDir(s));
    const localDotGit = resolve(s, '.git');
    if (normalizePathForCompare(commonDir) === normalizePathForCompare(localDotGit)) return null;
    return dirname(commonDir);
  } catch { return null; }
}

// The daemon lock file records `pid\nport\nstarted_at` — honor the port the
// daemon actually bound (daemon --port N), falling back to the default.
export function readDaemonPort(repoRoot: string): number {
  const lockPath = join(repoRoot, SVP_DIR, DAEMON_LOCK_FILE);
  try {
    const port = Number(readFileSync(lockPath, 'utf8').split('\n')[1]?.trim());
    if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  } catch { /* fall back to default */ }
  return DAEMON_DEFAULT_PORT;
}

export function canonicalWorkspace(cwd: string): string {
  try {
    const topLevel = execGitTopLevel(cwd);
    const commonDirPath = dirname(resolve(cwd, execGitCommonDir(cwd)));
    if (normalizePathForCompare(commonDirPath) !== normalizePathForCompare(topLevel)) {
      return normalizePathForCompare(commonDirPath);
    }
    return normalizePathForCompare(topLevel);
  } catch {
    return normalizePathForCompare(cwd);
  }
}

function resolveAlias(workspace: string): string {
  try {
    return resolve(workspace);
  } catch {
    return workspace;
  }
}

function boundSession(store: Store, workspace: string): string | undefined {
  const row = store.db.prepare('SELECT session_id FROM workspace_bindings WHERE workspace = ?').get(workspace);
  return row === undefined ? undefined : stringColumn(row, 'session_id');
}

function assertMatchingBinding(workspace: string, actual: string, expected: string, detail?: string): void {
  if (actual === expected) return;
  const resolved = detail === undefined ? '' : ` ${detail}`;
  throw new StoreVersionError(`workspace binding mismatch: ${workspace}${resolved} is bound to session ${actual}, received ${expected}`);
}

export function resolveAndBindWorkspace(store: Store, sessionId: string | null, cwd: string): { workspace: string; sessionId: string } {
  const canonical = canonicalWorkspace(cwd);
  const canonicalBinding = boundSession(store, canonical);
  if (sessionId === null) return { workspace: canonical, sessionId: canonicalBinding ?? '' };
  if (canonicalBinding !== undefined) {
    assertMatchingBinding(resolveAlias(cwd), canonicalBinding, sessionId);
    return { workspace: canonical, sessionId };
  }
  const alias = resolveAlias(cwd);
  const aliasBinding = alias === canonical ? undefined : boundSession(store, alias);
  if (aliasBinding !== undefined) assertMatchingBinding(alias, aliasBinding, sessionId, `resolves to ${canonical}`);
  return { workspace: canonical, sessionId };
}

export function bindWorkspace(store: Store, sessionId: string, workspace: string): void {
  const canonical = canonicalWorkspace(workspace);
  const existing = boundSession(store, canonical);

  if (existing !== undefined) {
    if (existing === sessionId) return;
    throw new StoreVersionError(
      `workspace ${canonical} is already bound to session ${existing}`,
    );
  }

  store.db.prepare(
    'INSERT INTO workspace_bindings (workspace, session_id, bound_at) VALUES (?, ?, ?)',
  ).run(canonical, sessionId, new Date().toISOString());
}

function tryAutoForward(): void {
  try {
    const cwd = getCwd();
    const args = process.argv.slice(2);
    if (args[0] === STORE_PROCESS_KIND.DAEMON) return;

    const br = blessedRoot(cwd);
    // br is non-null in worktrees, null at root (where .git IS the common dir)
    const repoRoot = br ?? worktreeRoot(cwd);

    if (!isDaemonRunning(repoRoot)) {
      // Worktree without daemon: error with guidance
      if (br !== null) {
        console.error(WORKTREE_DAEMON_REQUIRED_TEXT);
        process.exit(1);
      }
      // Root without daemon: fall through to direct mode
      return;
    }

    const token = readDaemonToken(repoRoot);
    if (token === null) return;
    process.exit(forwardToDaemonSync(args, token, readDaemonPort(repoRoot)));
  } catch { /* proceed with direct mode */ }
}

if (!process.env[NODE_TEST_CONTEXT_ENV]) {
  tryAutoForward();
}

function assertStoreNotHeldByDaemon(repoRoot: string): void {
  if (process.argv[2] === STORE_PROCESS_KIND.DAEMON || daemonStarting) return;
  if (isDaemonRunning(repoRoot)) {
    throw new StoreVersionError(`store is held by the daemon — run commands from the blessed root or start the daemon with \`sv-playbook daemon\``);
  }
  if (!process.env[NODE_TEST_CONTEXT_ENV] && isWorktree(getCwd())) {
    const br = blessedRoot(getCwd());
    if (br !== null && !isDaemonRunning(br)) {
      throw new StoreVersionError(WORKTREE_DAEMON_REQUIRED_TEXT);
    }
  }
}

let daemonStore: Store | null = null;
let daemonStarting = false;

export function setDaemonStore(s: Store | null): void {
  if (s === null) {
    daemonStore = null;
  } else {
    daemonStore = {
      db: s.db,
      orm: s.orm,
      dir: s.dir,
      close: () => {},
    };
  }
}

export function getDaemonStore(): Store | null {
  return daemonStore;
}

export function setDaemonStarting(v: boolean): void {
  daemonStarting = v;
}

export function openStore(repoRoot: string, options?: OpenStoreOptions): Store {
  if (daemonStore !== null) {
    return daemonStore;
  }
  assertStoreNotHeldByDaemon(repoRoot);
  const dir = join(repoRoot, SVP_DIR); mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, DB_FILE);
  const isNew = !existsSync(dbPath);
  const db = new Database(dbPath);
  applyExclusiveStorePragmas(db);
  db.exec(SCHEMA);
  if (isNew) {
    db.exec(`${STORE_PRAGMA.USER_VERSION} = ${SCHEMA_VERSION}`);
  } else if (!options?.skipVersionCheck) {
    checkVersionAndMigrate(db, repoRoot, options);
  }
  migratePacketColumn(db, 'pr', SQLITE_COLUMN_TYPE.TEXT, false);
  return { db, orm: createStoreOrm(db), dir, close: () => { db.close(); } };
}
export function openStoreReadOnly(repoRoot: string): Store {
  if (daemonStore !== null) return daemonStore;
  assertStoreNotHeldByDaemon(repoRoot);
  const dir = join(repoRoot, SVP_DIR);
  const path = join(dir, DB_FILE);
  if (!existsSync(path)) openStore(repoRoot).close();
  const db = new Database(path, { readonly: true, fileMustExist: true });
  applyReadOnlyStorePragmas(db);
  const version = readStoreSchemaVersion(db);
  if (version !== SCHEMA_VERSION) {
    db.close();
    throw new StoreVersionError(`store schema version ${String(version)} does not match runtime version ${SCHEMA_VERSION}`);
  }
  return { db, orm: createStoreOrm(db), dir, close: () => { db.close(); } };
}
