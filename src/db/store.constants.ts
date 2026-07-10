import { EVENT_EVIDENCE, EVENT_NOTE, EVENT_TAKEOVER, EVENT_TRANSITION, PACKET_STATUSES, STATUS } from '../tasks/service.constants.js';

export const SCHEMA_VERSION = 7;
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
  type TEXT NOT NULL DEFAULT '',
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
CREATE TABLE IF NOT EXISTS constitution_sections (
  section TEXT PRIMARY KEY,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS constitution_principles (
  id TEXT PRIMARY KEY,
  rule TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL DEFAULT '',
  budget_cap REAL NOT NULL DEFAULT 0,
  wip_limit INTEGER,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS sprint_tasks (
  sprint_id TEXT NOT NULL REFERENCES sprints(id),
  packet_id TEXT NOT NULL REFERENCES packets(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sprint_id, packet_id)
);
CREATE TABLE IF NOT EXISTS task_costs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  packet_id TEXT NOT NULL REFERENCES packets(id),
  amount REAL NOT NULL,
  recorded_by TEXT,
  recorded_at TEXT NOT NULL
);
`;
