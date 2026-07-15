import { EVENT_EVIDENCE, EVENT_IMPORTED, EVENT_NOTE, EVENT_TAKEOVER, EVENT_TRANSITION, PACKET_STATUSES, STATUS } from '../tasks/service.constants.js';
import { CONTEXT_STORE_SCHEMA } from './context.schema.constants.js';
import { ORCHESTRATION_STORE_SCHEMA } from './orchestration.schema.constants.js';
import { ROLE_CATALOG_STORE_SCHEMA } from './role-catalog.schema.constants.js';
import { ROLE_PROJECTION_STORE_SCHEMA } from './role-projection.schema.constants.js';
import { MODEL_CAPABILITY_EVALUATION_STORE_SCHEMA } from './model-capability-evaluation.schema.constants.js';
import { REVIEW_CANDIDATE_STORE_SCHEMA } from './review-candidate.schema.constants.js';
import {
  INTEGRATION_OUTCOME_VALUES,
  PROMOTION_STATUS_VALUES,
  PROMOTION_VERDICT_VALUES,
} from '../promotion/promotion.constants.js';
import { PROMOTION_TABLE } from '../promotion/promotion.schema.constants.js';
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

function sqlList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
}

const PROMOTION_IMMUTABLE_TRIGGERS = Object.values(PROMOTION_TABLE).map((table) => `
CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table}
BEGIN SELECT RAISE(ABORT, '${table} rows are immutable'); END;
CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete BEFORE DELETE ON ${table}
BEGIN SELECT RAISE(ABORT, '${table} rows are immutable'); END;`).join('\n');

export const PROMOTION_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS promotion_candidates (
  candidate_id TEXT PRIMARY KEY,
  review_candidate_id TEXT NOT NULL UNIQUE REFERENCES review_candidates(id),
  task_id TEXT NOT NULL REFERENCES packets(id),
  work_definition_version INTEGER NOT NULL,
  work_definition_digest TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  candidate_sha TEXT NOT NULL,
  config_digest TEXT NOT NULL,
  contract_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_id, work_definition_version, candidate_sha, config_digest, contract_digest)
);
CREATE TABLE IF NOT EXISTS promotion_state_events (
  event_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES promotion_candidates(candidate_id),
  sequence INTEGER NOT NULL,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN (${sqlList(PROMOTION_STATUS_VALUES)})),
  to_status TEXT NOT NULL CHECK (to_status IN (${sqlList(PROMOTION_STATUS_VALUES)})),
  trigger TEXT NOT NULL,
  reason TEXT,
  controller_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(candidate_id, sequence)
);
CREATE TABLE IF NOT EXISTS promotion_check_receipts (
  check_receipt_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES promotion_candidates(candidate_id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  candidate_sha TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  receipt_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS promotion_check_candidate ON promotion_check_receipts(candidate_id, kind);
CREATE TABLE IF NOT EXISTS promotion_review_verdicts (
  verdict_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES promotion_candidates(candidate_id) UNIQUE,
  reviewer_run_spec_id TEXT NOT NULL REFERENCES run_specs(id) UNIQUE,
  reviewer_session_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN (${sqlList(PROMOTION_VERDICT_VALUES)})),
  output_digest TEXT NOT NULL,
  candidate_sha TEXT NOT NULL,
  work_definition_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS promotion_integration_attempts (
  attempt_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES promotion_candidates(candidate_id) UNIQUE,
  effect_key TEXT NOT NULL UNIQUE,
  target_ref TEXT NOT NULL,
  before_sha TEXT NOT NULL,
  candidate_sha TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS promotion_integration_outcomes (
  outcome_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES promotion_integration_attempts(attempt_id) UNIQUE,
  candidate_id TEXT NOT NULL REFERENCES promotion_candidates(candidate_id),
  outcome TEXT NOT NULL CHECK (outcome IN (${sqlList(INTEGRATION_OUTCOME_VALUES)})),
  result_sha TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS promotion_receipts (
  receipt_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES promotion_candidates(candidate_id) UNIQUE,
  review_candidate_id TEXT NOT NULL REFERENCES review_candidates(id),
  task_id TEXT NOT NULL REFERENCES packets(id),
  candidate_sha TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  result_sha TEXT NOT NULL,
  reviewer_run_spec_id TEXT NOT NULL REFERENCES run_specs(id),
  verification_digest TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  receipt_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS promotion_state_event_candidate ON promotion_state_events(candidate_id, sequence);
${PROMOTION_IMMUTABLE_TRIGGERS}
`;

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
${PROMOTION_STORE_SCHEMA}
`;
