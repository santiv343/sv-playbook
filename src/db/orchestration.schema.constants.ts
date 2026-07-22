import {
  COORDINATOR_CONFIG_DEFAULTS,
  COORDINATOR_CONFIG_KEY,
  WORKFLOW_DEFINITION_STATUSES,
  WORKFLOW_EFFECT_STATUSES,
  WORKFLOW_EXECUTOR,
  WORKFLOW_EXECUTORS,
  WORKFLOW_STATUSES,
} from '../orchestration/orchestration.constants.js';

function sqlValue(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlValues(values: readonly string[]): string {
  return values.map(sqlValue).join(', ');
}

// Notar el CHECK compuesto en workflow_definition_steps: fuerza a nivel de
// BASE DE DATOS que executor=agent implica role_id presente y operation_id
// ausente (y viceversa para runtime/human) — la misma regla que
// validateAgentBinding/validateRuntimeBinding en runtime-validation.ts
// verifican en aplicación, pero acá está duplicada como invariante SQL
// para que ni siquiera una migración manual pueda dejar una fila inválida.
export const ORCHESTRATION_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN (${sqlValues(WORKFLOW_DEFINITION_STATUSES)})),
  start_step_key TEXT NOT NULL,
  definition_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_definition_one_active
  ON workflow_definitions(id) WHERE status = ${sqlValue(WORKFLOW_DEFINITION_STATUSES[0])};
CREATE TABLE IF NOT EXISTS workflow_definition_steps (
  definition_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  executor TEXT NOT NULL CHECK (executor IN (${sqlValues(WORKFLOW_EXECUTORS)})),
  role_id TEXT,
  operation_id TEXT,
  phase TEXT NOT NULL,
  input_contract_ref TEXT NOT NULL REFERENCES artifact_contracts(ref),
  output_contract_ref TEXT NOT NULL REFERENCES artifact_contracts(ref),
  context_tags_json TEXT NOT NULL,
  context_references_json TEXT NOT NULL,
  requested_capabilities_json TEXT NOT NULL,
  max_attempts INTEGER NOT NULL CHECK (max_attempts > 0),
  PRIMARY KEY (definition_id, definition_version, step_key),
  FOREIGN KEY (definition_id, definition_version) REFERENCES workflow_definitions(id, version),
  CHECK ((executor = ${sqlValue(WORKFLOW_EXECUTOR.AGENT)} AND role_id IS NOT NULL AND operation_id IS NULL)
    OR (executor = ${sqlValue(WORKFLOW_EXECUTOR.RUNTIME)} AND role_id IS NULL AND operation_id IS NOT NULL)
    OR (executor = ${sqlValue(WORKFLOW_EXECUTOR.HUMAN)} AND role_id IS NULL AND operation_id IS NULL))
);
CREATE TABLE IF NOT EXISTS workflow_definition_routes (
  definition_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  from_step_key TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority >= 0),
  target_step_key TEXT,
  output_pointer TEXT,
  equals_json TEXT,
  PRIMARY KEY (definition_id, definition_version, from_step_key, priority),
  FOREIGN KEY (definition_id, definition_version, from_step_key)
    REFERENCES workflow_definition_steps(definition_id, definition_version, step_key),
  FOREIGN KEY (definition_id, definition_version, target_step_key)
    REFERENCES workflow_definition_steps(definition_id, definition_version, step_key),
  CHECK ((output_pointer IS NULL AND equals_json IS NULL)
    OR (output_pointer IS NOT NULL AND equals_json IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS workflow_artifacts (
  id TEXT PRIMARY KEY,
  contract_ref TEXT NOT NULL REFERENCES artifact_contracts(ref),
  value_json TEXT NOT NULL,
  value_digest TEXT NOT NULL,
  producer_kind TEXT NOT NULL CHECK (producer_kind IN (${sqlValues(WORKFLOW_EXECUTORS)})),
  producer_ref TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  subject_ref TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${sqlValues(WORKFLOW_STATUSES)})),
  current_step_key TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  input_artifact_id TEXT NOT NULL REFERENCES workflow_artifacts(id),
  output_artifact_id TEXT REFERENCES workflow_artifacts(id),
  failure_code TEXT,
  failure_detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (definition_id, definition_version) REFERENCES workflow_definitions(id, version)
);
CREATE TABLE IF NOT EXISTS workflow_effects (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_runs(id),
  step_key TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  status TEXT NOT NULL CHECK (status IN (${sqlValues(WORKFLOW_EFFECT_STATUSES)})),
  input_artifact_id TEXT NOT NULL REFERENCES workflow_artifacts(id),
  output_artifact_id TEXT REFERENCES workflow_artifacts(id),
  lease_owner TEXT,
  lease_expires_at TEXT,
  detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workflow_id, step_key, attempt),
  FOREIGN KEY (workflow_id) REFERENCES workflow_runs(id)
);
CREATE TABLE IF NOT EXISTS workflow_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL REFERENCES workflow_runs(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  event_type TEXT NOT NULL,
  step_key TEXT,
  safe_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (workflow_id, revision)
);
CREATE INDEX IF NOT EXISTS workflow_effects_pending
  ON workflow_effects(status, created_at);
CREATE INDEX IF NOT EXISTS workflow_events_stream
  ON workflow_events(seq);
CREATE TABLE IF NOT EXISTS role_execution_profile_preferences (
  role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  profile_id TEXT NOT NULL REFERENCES execution_profiles(id),
  priority INTEGER NOT NULL CHECK (priority >= 0),
  PRIMARY KEY (role_id, profile_id),
  UNIQUE (role_id, priority)
);
CREATE TABLE IF NOT EXISTS workflow_coordinator_config (
  config_key TEXT PRIMARY KEY,
  effect_lease_ms INTEGER NOT NULL CHECK (effect_lease_ms > 0),
  lease_renewal_interval_ms INTEGER NOT NULL CHECK (lease_renewal_interval_ms > 0),
  idle_poll_interval_ms INTEGER NOT NULL CHECK (idle_poll_interval_ms > 0),
  updated_at TEXT NOT NULL,
  CHECK (lease_renewal_interval_ms < effect_lease_ms)
);
INSERT OR IGNORE INTO workflow_coordinator_config
  (config_key, effect_lease_ms, lease_renewal_interval_ms, idle_poll_interval_ms, updated_at)
  VALUES (
    ${sqlValue(COORDINATOR_CONFIG_KEY)},
    ${COORDINATOR_CONFIG_DEFAULTS.EFFECT_LEASE_MS},
    ${COORDINATOR_CONFIG_DEFAULTS.LEASE_RENEWAL_INTERVAL_MS},
    ${COORDINATOR_CONFIG_DEFAULTS.IDLE_POLL_INTERVAL_MS},
    '1970-01-01T00:00:00.000Z'
  );
CREATE TABLE IF NOT EXISTS workflow_failure_policies (
  error_code TEXT PRIMARY KEY,
  retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
  updated_at TEXT NOT NULL
);
`;
