import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { EVENT_NOTE, EVENT_TAKEOVER, EVENT_TRANSITION, PACKET_STATUSES } from '../tasks/service.js';

export interface Store { readonly db: DatabaseSync; readonly dir: string; close(): void; }

export const SVP_DIR = '.svp';
export const DB_FILE = 'playbook.sqlite';

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const sqlInList = (values: readonly string[]): string => values.map(sqlString).join(', ');
const TRANSITION_STATUSES = ['none', ...PACKET_STATUSES];
const EVENT_COMMANDS = [EVENT_TRANSITION, EVENT_NOTE, EVENT_TAKEOVER];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS packets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (${sqlInList(PACKET_STATUSES)})),
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

export function openStore(repoRoot: string): Store {
  const dir = join(repoRoot, SVP_DIR);
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, DB_FILE));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return { db, dir, close: () => { db.close(); } };
}
