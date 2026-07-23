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

// git imprime paths con forward-slash mientras node:path resuelve a
// backslashes en win32 — normalizar ambos lados (separadores, mayúsculas de
// unidad, y cualquier alias de nombre corto 8.3) antes de comparar, o los
// repo roots se clasifican mal en Windows cuando os.tmpdir() devuelve un
// path de nombre corto mientras git devuelve el nombre largo canónico.
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

// El lock file del daemon registra `pid\nport\nstarted_at` — respeta el
// puerto que el daemon efectivamente bindeó (daemon --port N), con
// fallback al default si el archivo no está o es inválido.
export function readDaemonPort(repoRoot: string): number {
  const lockPath = join(repoRoot, SVP_DIR, DAEMON_LOCK_FILE);
  try {
    const port = Number(readFileSync(lockPath, 'utf8').split('\n')[1]?.trim());
    if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  } catch { /* fall back to default */ }
  return DAEMON_DEFAULT_PORT;
}

// ── Workspace bindings (workspace → session, persisted) ──
// La clave de binding es la raíz canónica del worktree: los worktrees
// enlazados (`git worktree add`) tienen su propio binding, mientras que
// subdirectorios y otros alias del mismo worktree colapsan en uno solo.
// Paths fuera de un repo git caen a un fallback del cwd resuelto.
function bindingWorkspace(cwd: string): string {
  try {
    return normalizePathForCompare(execGitTopLevel(cwd));
  } catch {
    return normalizePathForCompare(cwd);
  }
}

// Un workspace pertenece al repositorio del daemon cuando está dentro de la
// "blessed root" (la raíz del checkout principal) o cuando su git common
// dir resuelve de vuelta a ella (los worktrees enlazados pueden vivir en
// cualquier parte del disco, no necesariamente bajo la raíz).
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

// Una sesión reclamada que ya está persistida para otro workspace es un
// intento de cross-bind: se rechaza en vez de crear un segundo enlace de
// identidad (una sesión sólo puede estar atada a un worktree).
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

// Se ejecuta al importar este módulo (ver el `if` de abajo), ANTES de que
// ningún comando corra: si hay un daemon vivo para este repo, reenvía el
// proceso CLI entero hacia él vía HTTP y termina este proceso con el exit
// code que devolvió el daemon (process.exit). Es la forma en que "single
// blessed writer" se cumple sin que cada comando tenga que saber si está
// hablando con el daemon o abriendo el store directo — la decisión se toma
// acá, una sola vez, antes de que exista esa ambigüedad.
function tryAutoForward(): void {
  try {
    const cwd = getCwd();
    const args = process.argv.slice(2);
    if (args[0] === STORE_PROCESS_KIND.DAEMON) return;

    // Scripts de setup del pipeline de build (scripts/bootstrap-*.mjs) no
    // deben pasar por el daemon — son parte del pipeline de build/verify,
    // no del ciclo dispatch/CLI del usuario.
    const thisScript = process.argv[1];
    if (thisScript && /^bootstrap-[\w.-]+\.mjs$/.test(basename(thisScript))) return;

    // Clasificar en la raíz del worktree: desde un subdirectorio, la entrada
    // .git local difiere del common dir, lo cual clasificaría mal a simples
    // subdirectorios del checkout principal como si fueran worktrees enlazados.
    const worktree = worktreeRoot(cwd);
    const br = blessedRoot(worktree);
    // br es no-null en worktrees enlazados, null en la raíz (donde .git ES el common dir)
    const repoRoot = br ?? worktree;

    if (!isDaemonRunning(repoRoot)) {
      // Worktree sin daemon: no hay forma segura de escribir sin daemon
      // (dos worktrees del mismo repo escribiendo directo al store
      // colisionarían) — error con guía en vez de dejar avanzar.
      if (br !== null) {
        console.error(WORKTREE_DAEMON_REQUIRED_TEXT);
        process.exit(1);
      }
      // Raíz sin daemon: no hay riesgo de colisión, sigue en modo directo.
      return;
    }

    const token = readDaemonToken(repoRoot);
    if (token === null) return;

    const port = readDaemonPort(repoRoot);
    // El digest de build evita que un CLI compilado de una versión distinta
    // hable con un daemon de otra — reenviar comandos a un daemon con schema
    // o contratos desalineados sería peor que fallar rápido acá.
    const myDigest = readBuildDigest();
    const daemonDigest = fetchDaemonBuildDigestSync(port);
    if (daemonDigest !== myDigest) {
      console.error('daemon is running an older build — restart it with `sv-playbook daemon`');
      process.exit(1);
    }

    process.exit(forwardToDaemonSync(args, token, port, repoRoot));
  } catch { /* si algo falla acá, seguir en modo directo es más seguro que bloquear el comando */ }
}

// NODE_TEST_CONTEXT_ENV desactiva el auto-forward en tests: los tests abren
// el store directo y no quieren depender de un daemon real corriendo.
if (!process.env[NODE_TEST_CONTEXT_ENV]) {
  tryAutoForward();
}

// Segunda línea de defensa del single-blessed-writer, para cuando
// tryAutoForward no aplicó (ej. este mismo proceso ES el daemon, o el
// forward falló silenciosamente): si hay un daemon vivo y este proceso no es
// el daemon ni está arrancando uno, abrir el store acá sería una segunda
// escritura concurrente — se rechaza en vez de arriesgar corrupción.
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

// Handle del store que mantiene abierto el propio proceso daemon (distinto
// de daemonStore=null, que significa "no soy el daemon, abrí normal"). Todo
// comando que corre DENTRO del proceso daemon reutiliza este mismo handle
// (ver openStore/openStoreReadOnly más abajo) en vez de abrir su propia
// conexión SQLite — es lo que hace al daemon un único escritor real y no
// sólo un proxy.
let daemonStore: Store | null = null;
let daemonStarting = false;

// close() se pisa por un no-op: el daemon es dueño del ciclo de vida real de
// la conexión (la cierra él mismo al apagarse); un comando individual que
// pidió prestado este store nunca debe poder cerrarlo por accidente.
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

// Punto de entrada principal para lectura/escritura. relocateStoreIfNeeded
// migra el store a su ubicación externa (fuera del árbol git, ver
// store-location.ts) si todavía está en la ubicación legacy — se chequea en
// cada apertura porque es barato y mantiene esa migración transparente sin
// requerir un comando manual.
export function openStore(repoRoot: string, options?: OpenStoreOptions): Store {
  if (daemonStore !== null) {
    return daemonStore;
  }
  assertStoreNotHeldByDaemon(repoRoot);
  relocateStoreIfNeeded(repoRoot, canonicalRootOrRepoRoot(repoRoot));
  return openStoreAt(resolveStoreDir(repoRoot), repoRoot, options);
}

// Si el archivo todavía no existe (primera lectura de un repo sin store),
// se abre y cierra una vez en modo escritura sólo para forzar la creación
// del schema — de ahí en más esta conexión de sólo lectura puede asumir que
// el archivo y el schema ya están.
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
