import { EVENT_EVIDENCE, EVENT_NOTE, EVENT_TAKEOVER, EVENT_TRANSITION, PACKET_STATUSES, STATUS } from '../tasks/service.constants.js';

export const SCHEMA_VERSION = 4;
export const SVP_DIR = '.svp';
export const DB_FILE = 'playbook.sqlite';

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const sqlInList = (values: readonly string[]): string => values.map(sqlString).join(', ');
const TRANSITION_STATUSES = ['none', ...PACKET_STATUSES];
const EVENT_COMMANDS = [EVENT_TRANSITION, EVENT_NOTE, EVENT_TAKEOVER, EVENT_EVIDENCE];

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS packets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '${STATUS.DRAFT}' CHECK (status IN (${sqlInList(PACKET_STATUSES)})),
  body TEXT NOT NULL DEFAULT '',
  write_set TEXT NOT NULL DEFAULT '[]',
  pr TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS packet_deps (
  packet_id TEXT NOT NULL REFERENCES packets(id),
  depends_on_id TEXT NOT NULL REFERENCES packets(id),
  PRIMARY KEY (packet_id, depends_on_id)
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
