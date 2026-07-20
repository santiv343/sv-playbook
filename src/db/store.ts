import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync as fsRealpathSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { stringColumn } from './rows.js';
import { DB_FILE, NODE_TEST_CONTEXT_ENV, SCHEMA, SCHEMA_VERSION, STORE_PROCESS_KIND, SVP_DIR, WORKTREE_DAEMON_REQUIRED_TEXT } from './store.constants.js';
import { resolveStoreRoot } from './store-location.js';
import { relocateStoreIfNeeded } from './store-migration-relocate.js';
import { GIT_ARGUMENT } from '../git.constants.js';
import { EMPTY_SIZE, OS_PLATFORM } from '../platform.constants.js';
import { getCwd } from '../runtime/context.js';
import { StoreVersionError } from './store.errors.js';
import { DAEMON_DEFAULT_PORT, DAEMON_LOCK_FILE, DAEMON_TOKEN_FILE, GIT_DIR_NAME } from '../daemon/daemon.constants.js';
import { fetchDaemonBuildDigestSync, forwardToDaemonSync } from '../daemon/client.js';
import { readBuildDigest } from './build-digest.js';
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

export function resolveStoreDir(repoRoot: string): string {
  try {
    return resolveStoreRoot(commonRoot(repoRoot));
  } catch {
    return resolveStoreRoot(repoRoot);
  }
}

function canonicalRootOrRepoRoot(repoRoot: string): string {
  try {
    return commonRoot(repoRoot);
  } catch {
    return repoRoot;
  }
}

// ── Daemon client (worktree → daemon forwarding) ──
function execGitCommonDir(s: string): string {
  return execFileSync('git', GIT_COMMON_DIR_ARGS, { cwd: s, encoding: 'utf8' }).trim();
}

function execGitTopLevel(s: string): string {
  return execFileSync('git', GIT_TOPLEVEL_ARGS, { cwd: s, encoding: 'utf8' }).trim();
}

// git prints forward-slash paths while node:path resolves to backslashes on
// win32 — normalize both sides (separators, drive-letter case, and any 8.3
// short-name aliases) before comparing, or repo roots are misclassified on
// Windows when os.tmpdir() returns a short-name path while git returns the
// canonical long-name path.
function tryNativeRealpath(p: string): string | null {
  try { return fsRealpathSync.native(p); } catch { return null; }
}

function tryRealpath(p: string): string | null {
  try { return fsRealpathSync(p); } catch { return null; }
}

function tryCanonicalPath(p: string): string | null {
  const direct = process.platform === OS_PLATFORM.WINDOWS ? tryNativeRealpath(p) : tryRealpath(p);
  if (direct !== null) return direct;
  // The path itself may not exist yet (e.g. a test constructs a subdirectory
  // path before creating it). Canonicalize the parent and append the final
  // name so a short-name parent does not leak into the comparison.
  const parent = dirname(p);
  const base = basename(p);
  const canonicalParent = process.platform === OS_PLATFORM.WINDOWS ? tryNativeRealpath(parent) : tryRealpath(parent);
  return canonicalParent !== null ? join(canonicalParent, base) : null;
}

function normalizePathForCompare(p: string): string {
  const canonical = tryCanonicalPath(p);
  const resolved = canonical ?? resolve(p);
  return process.platform === OS_PLATFORM.WINDOWS ? resolved.toLowerCase() : resolved;
}

export function isWorktree(s: string): boolean {
  try { return normalizePathForCompare(dirname(resolve(s, execGitCommonDir(s)))) !== normalizePathForCompare(execGitTopLevel(s)); }
  catch { return false; }
}
const LOCK_FILE_NONCE_LINE_COUNT = 4;

function checkDaemonIdentity(lines: string[], repoRoot: string): boolean {
  const storedNonce = lines.length >= LOCK_FILE_NONCE_LINE_COUNT ? lines[3]?.trim() : undefined;
  if (storedNonce === undefined || storedNonce.length === EMPTY_SIZE) return true;
  const token = readDaemonToken(repoRoot);
  return token !== null && token === storedNonce;
}

export function isDaemonRunning(repoRoot: string): boolean {
  const lockPath = join(repoRoot, SVP_DIR, DAEMON_LOCK_FILE);
  if (!existsSync(lockPath)) return false;
  try {
    const lines = readFileSync(lockPath, 'utf8').trim().split('\n');
    const pid = Number(lines[0]);
    if (Number.isNaN(pid)) return false;
    try { process.kill(pid, 0); }
    catch { unlinkSync(lockPath); return false; }
    if (!checkDaemonIdentity(lines, repoRoot)) {
      unlinkSync(lockPath);
      return false;
    }
    return true;
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
    const localDotGit = resolve(s, GIT_DIR_NAME);
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

// ── Workspace bindings (workspace → session, persisted) ──
// The binding key is the canonical worktree root: linked worktrees get their
// own binding, while subdirectories and other aliases of the same worktree
// collapse onto one. Paths outside git fall back to the resolved cwd.
function bindingWorkspace(cwd: string): string {
  try {
    return normalizePathForCompare(execGitTopLevel(cwd));
  } catch {
    return normalizePathForCompare(cwd);
  }
}

// A workspace belongs to the daemon's repository when it sits inside the
// blessed root or when its git common dir resolves back to it (linked
// worktrees may live anywhere on disk).
export function workspaceWithinRepo(repoRoot: string, cwd: string): boolean {
  const workspace = bindingWorkspace(cwd);
  const root = normalizePathForCompare(repoRoot);
  if (workspace === root || workspace.startsWith(`${root}${sep}`)) return true;
  try {
    return normalizePathForCompare(commonRoot(workspace)) === root;
  } catch {
    return false;
  }
}

function boundSession(store: Store, workspace: string): string | undefined {
  const row = store.db.prepare('SELECT session_id FROM workspace_bindings WHERE workspace = ?').get(workspace);
  return row === undefined ? undefined : stringColumn(row, 'session_id');
}

function assertMatchingBinding(workspace: string, actual: string, expected: string): void {
  if (actual === expected) return;
  throw new StoreVersionError(`workspace binding mismatch: ${workspace} is bound to session ${actual}, received ${expected}`);
}

// A claimed session that is already persisted for a different workspace is a
// cross-bind attempt: reject it instead of creating a second identity link.
function assertClaimMatchesSession(store: Store, workspace: string, sessionId: string): void {
  const row = store.db.prepare('SELECT worktree FROM sessions WHERE id = ?').get(sessionId);
  if (row === undefined) return;
  const worktree = stringColumn(row, 'worktree');
  if (normalizePathForCompare(worktree) !== workspace) {
    throw new StoreVersionError(`session ${sessionId} belongs to workspace ${worktree}, not ${workspace}`);
  }
}

export function resolveAndBindWorkspace(store: Store, sessionId: string | null, cwd: string): { workspace: string; sessionId: string } {
  const workspace = bindingWorkspace(cwd);
  const existing = boundSession(store, workspace);
  if (existing !== undefined) {
    if (sessionId === null) throw new StoreVersionError(`workspace ${workspace} is already bound: a session claim is required`);
    assertMatchingBinding(workspace, existing, sessionId);
    return { workspace, sessionId };
  }
  if (sessionId === null) return { workspace, sessionId: '' };
  assertClaimMatchesSession(store, workspace, sessionId);
  bindWorkspace(store, sessionId, workspace);
  return { workspace, sessionId };
}

export function bindWorkspace(store: Store, sessionId: string, workspace: string): void {
  const canonical = bindingWorkspace(workspace);
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

    // Classify at the worktree root: from a subdirectory the local .git entry
    // differs from the common dir, which would misclassify plain
    // subdirectories of the primary checkout as linked worktrees.
    const worktree = worktreeRoot(cwd);
    const br = blessedRoot(worktree);
    // br is non-null in worktrees, null at root (where .git IS the common dir)
    const repoRoot = br ?? worktree;

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

    const port = readDaemonPort(repoRoot);
    const myDigest = readBuildDigest();
    const daemonDigest = fetchDaemonBuildDigestSync(port);
    if (daemonDigest !== myDigest) {
      console.error('daemon is running an older build — restart it with `sv-playbook daemon`');
      process.exit(1);
    }

    process.exit(forwardToDaemonSync(args, token, port));
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
      repoRoot: s.repoRoot,
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

function createStore(db: Database.Database, dir: string, repoRoot: string): Store {
  return {
    db,
    orm: createStoreOrm(db),
    dir,
    repoRoot,
    close: () => {
      if (db.open) db.close();
    },
  };
}

function openStoreAt(dir: string, repoRoot: string, options?: OpenStoreOptions): Store {
  mkdirSync(dir, { recursive: true });
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
  return createStore(db, dir, repoRoot);
}

export function openStore(repoRoot: string, options?: OpenStoreOptions): Store {
  if (daemonStore !== null) {
    return daemonStore;
  }
  assertStoreNotHeldByDaemon(repoRoot);
  relocateStoreIfNeeded(repoRoot, canonicalRootOrRepoRoot(repoRoot));
  return openStoreAt(resolveStoreDir(repoRoot), repoRoot, options);
}

function openStoreReadOnlyAt(dir: string, repoRoot: string): Store {
  const path = join(dir, DB_FILE);
  if (!existsSync(path)) {
    relocateStoreIfNeeded(repoRoot, canonicalRootOrRepoRoot(repoRoot));
    openStore(repoRoot).close();
  }

  const db = new Database(path, { readonly: true, fileMustExist: true });
  applyReadOnlyStorePragmas(db);
  const version = readStoreSchemaVersion(db);
  if (version !== SCHEMA_VERSION) {
    db.close();
    throw new StoreVersionError(`store schema version ${String(version)} does not match runtime version ${SCHEMA_VERSION}`);
  }
  return createStore(db, dir, repoRoot);
}

export function openStoreReadOnly(repoRoot: string): Store {
  if (daemonStore !== null) return daemonStore;
  assertStoreNotHeldByDaemon(repoRoot);
  return openStoreReadOnlyAt(resolveStoreDir(repoRoot), repoRoot);
}

export function openStoreInTree(repoRoot: string, dir: string, options?: OpenStoreOptions): Store {
  return openStoreAt(dir, repoRoot, options);
}
