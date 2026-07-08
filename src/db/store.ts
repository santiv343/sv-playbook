import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { EVENT_EVIDENCE, EVENT_NOTE, EVENT_TAKEOVER, EVENT_TRANSITION, PACKET_STATUSES } from '../tasks/service.js';
import { numberColumn } from './rows.js';

export interface Store { readonly db: DatabaseSync; readonly dir: string; close(): void; }

export class StoreVersionError extends Error {
  constructor(message: string) { super(message); this.name = 'StoreVersionError'; }
}

export const SCHEMA_VERSION = 2;
export const SVP_DIR = '.svp';
export const DB_FILE = 'playbook.sqlite';

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const sqlInList = (values: readonly string[]): string => values.map(sqlString).join(', ');
const TRANSITION_STATUSES = ['none', ...PACKET_STATUSES];
const EVENT_COMMANDS = [EVENT_TRANSITION, EVENT_NOTE, EVENT_TAKEOVER, EVENT_EVIDENCE];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS packets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (${sqlInList(PACKET_STATUSES)})),
  write_set TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transitions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  packet_id TEXT NOT NULL REFERENCES packets(id),
  from_status TEXT NOT NULL CHECK (from_status IN (${sqlInList(TRANSITION_STATUSES)})),
  to_status TEXT NOT NULL CHECK (to_status IN (${sqlInList(TRANSITION_STATUSES)})),
  session_id TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  worktree TEXT NOT NULL,
  harness TEXT,
  model TEXT,
  started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leases (
  packet_id TEXT PRIMARY KEY REFERENCES packets(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  worktree TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  packet_id TEXT,
  command TEXT NOT NULL CHECK (command IN (${sqlInList(EVENT_COMMANDS)})),
  detail TEXT,
  at TEXT NOT NULL
);
`;

export function commonRoot(startDir: string): string {
  const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: startDir,
    encoding: 'utf8',
  }).trim();
  return dirname(resolve(startDir, out));
}

function applyPragmas(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
}

interface OpenStoreOptions {
  skipVersionCheck?: boolean;
}

function trimBackups(backupDir: string): void {
  const current = readdirSync(backupDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({ name: f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (current.length <= 10) return;
  for (let i = 10; i < current.length; i++) {
    const entry = current[i];
    if (entry !== undefined) rmSync(join(backupDir, entry.name));
  }
}

function rotateBackups(dir: string, dbPath: string): void {
  const backupDir = join(dir, 'backups');
  mkdirSync(backupDir, { recursive: true });
  if (!existsSync(dbPath)) return;
  const files = readdirSync(backupDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({ name: f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length > 0) {
    const newest = files[0];
    if (newest !== undefined && Date.now() - newest.mtime < 10 * 60 * 1000) return;
  }
  const stamp = new Date().toISOString().replace(/[:\-T.Z]/g, '').slice(0, 14);
  copyFileSync(dbPath, join(backupDir, `playbook-${stamp}.sqlite`));
  trimBackups(backupDir);
}

export function openStore(repoRoot: string, options?: OpenStoreOptions): Store {
  const dir = join(repoRoot, SVP_DIR);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, DB_FILE);
  const isNew = !existsSync(dbPath);
  rotateBackups(dir, dbPath);
  const db = new DatabaseSync(dbPath);
  applyPragmas(db);
  db.exec(SCHEMA);
  if (isNew) {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    rotateBackups(dir, dbPath);
  } else if (!options?.skipVersionCheck) {
    const row = db.prepare('PRAGMA user_version').get();
    const currentVersion = numberColumn(row, 'user_version');
    if (currentVersion !== SCHEMA_VERSION) {
      db.close();
      throw new StoreVersionError(
        `store schema v${currentVersion} does not match v${SCHEMA_VERSION}: run sv-playbook rebuild from the main repo with no other sv-playbook processes running`,
      );
    }
  }
  return { db, dir, close: () => { db.close(); } };
}
