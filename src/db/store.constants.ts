import { EVENT_EVIDENCE, EVENT_IMPORTED, EVENT_NOTE, EVENT_TAKEOVER, EVENT_TRANSITION, PACKET_STATUSES, STATUS } from '../tasks/service.constants.js';
import { CONTEXT_STORE_SCHEMA } from './context.schema.constants.js';
import { ORCHESTRATION_STORE_SCHEMA } from './orchestration.schema.constants.js';
import { ROLE_CATALOG_STORE_SCHEMA } from './role-catalog.schema.constants.js';
import { ROLE_PROJECTION_STORE_SCHEMA } from './role-projection.schema.constants.js';
import { MODEL_CAPABILITY_EVALUATION_STORE_SCHEMA } from './model-capability-evaluation.schema.constants.js';
import { REVIEW_CANDIDATE_STORE_SCHEMA } from './review-candidate.schema.constants.js';
export { SCHEMA_VERSION } from './store.migration-manifest.constants.js';

export const SVP_DIR = '.svp';
export const SQLITE_FILE_HEADER = 'SQLite format 3\0';
export const SQLITE_INTEGRITY_OK = 'ok';
export const DIGEST_ALGORITHM = { SHA256: 'sha256' } as const;
export const DEFAULT_GIT_BRANCH = { MAIN: 'main', LEGACY: 'master' } as const;
export const STORE_PROCESS_KIND = { DAEMON: 'daemon' } as const;
export const DB_FILE = 'playbook.sqlite';
export const STORE_TABLE = {
  CONSTITUTION_SECTIONS: 'constitution_sections',
  CONSTITUTION_PRINCIPLES: 'constitution_principles',
  SPRINTS: 'sprints',
  SPRINT_TASKS: 'sprint_tasks',
  TASK_COSTS: 'task_costs',
} as const;

export const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;
export const sqlInList = (values: readonly string[]): string => values.map(sqlString).join(', ');
const TRANSITION_STATUSES = ['none', ...PACKET_STATUSES];
export const EVENT_SCHEMA_MIGRATED = 'schema-migrated';
export const WORKTREE_DAEMON_REQUIRED_TEXT = 'This is a git worktree. Start `sv-playbook daemon` at the repo root first.';
export const EVENT_COMMANDS = [EVENT_TRANSITION, EVENT_NOTE, EVENT_TAKEOVER, EVENT_EVIDENCE, EVENT_IMPORTED, EVENT_SCHEMA_MIGRATED];

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
CREATE TABLE IF NOT EXISTS packet_definitions (
  packet_id TEXT NOT NULL REFERENCES packets(id),
  version INTEGER NOT NULL CHECK (version > 0),
  definition_digest TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (packet_id, version),
  UNIQUE (packet_id, definition_digest)
);
${CONTEXT_STORE_SCHEMA}
${ORCHESTRATION_STORE_SCHEMA}
${ROLE_CATALOG_STORE_SCHEMA}
${ROLE_PROJECTION_STORE_SCHEMA}
${MODEL_CAPABILITY_EVALUATION_STORE_SCHEMA}
${REVIEW_CANDIDATE_STORE_SCHEMA}
`;
