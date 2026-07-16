import { CAPABILITY_EFFECT, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';

const quoted = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

const statuses = quoted(Object.values(CONTEXT_ITEM_STATUS));
const strengths = quoted(Object.values(CONTEXT_ITEM_STRENGTH));
const effects = quoted(Object.values(CAPABILITY_EFFECT));

export const RUN_SPECS_TABLE = 'run_specs';
export const RUN_SPEC_RETRY_OF_COLUMN = 'retry_of_run_spec_id';
export const EXECUTION_PROFILES_TABLE = 'execution_profiles';
export const MAX_RUN_DURATION_COLUMN = 'max_run_duration_ms';

export const CONTEXT_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS context_items (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${statuses})),
  strength TEXT NOT NULL CHECK (strength IN (${strengths})),
  semantic_key TEXT NOT NULL,
  body TEXT NOT NULL,
  provenance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS context_item_tags (
  item_id TEXT NOT NULL,
  item_version INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (item_id, item_version, tag),
  FOREIGN KEY (item_id, item_version) REFERENCES context_items(id, version)
);
CREATE TABLE IF NOT EXISTS context_item_selectors (
  item_id TEXT NOT NULL,
  item_version INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (item_id, item_version, dimension, value),
  FOREIGN KEY (item_id, item_version) REFERENCES context_items(id, version)
);
CREATE TABLE IF NOT EXISTS context_item_dependencies (
  item_id TEXT NOT NULL,
  item_version INTEGER NOT NULL,
  dependency_id TEXT NOT NULL,
  dependency_version INTEGER NOT NULL,
  PRIMARY KEY (item_id, item_version, dependency_id, dependency_version),
  FOREIGN KEY (item_id, item_version) REFERENCES context_items(id, version),
  FOREIGN KEY (dependency_id, dependency_version) REFERENCES context_items(id, version)
);
CREATE TABLE IF NOT EXISTS context_item_supersessions (
  item_id TEXT NOT NULL,
  item_version INTEGER NOT NULL,
  superseded_id TEXT NOT NULL,
  superseded_version INTEGER NOT NULL,
  PRIMARY KEY (item_id, item_version, superseded_id, superseded_version),
  FOREIGN KEY (item_id, item_version) REFERENCES context_items(id, version),
  FOREIGN KEY (superseded_id, superseded_version) REFERENCES context_items(id, version)
);
CREATE TABLE IF NOT EXISTS context_item_capabilities (
  item_id TEXT NOT NULL,
  item_version INTEGER NOT NULL,
  capability TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN (${effects})),
  PRIMARY KEY (item_id, item_version, capability),
  FOREIGN KEY (item_id, item_version) REFERENCES context_items(id, version)
);
CREATE TABLE IF NOT EXISTS context_precedence (
  kind TEXT PRIMARY KEY,
  rank INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS context_packs (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  role TEXT NOT NULL,
  phase TEXT NOT NULL,
  inputs_json TEXT NOT NULL,
  semantic_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS context_pack_items (
  pack_id TEXT NOT NULL REFERENCES context_packs(id),
  item_id TEXT NOT NULL,
  item_version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  content_digest TEXT NOT NULL,
  PRIMARY KEY (pack_id, item_id, item_version),
  UNIQUE (pack_id, ordinal),
  FOREIGN KEY (item_id, item_version) REFERENCES context_items(id, version)
);
CREATE TABLE IF NOT EXISTS context_pack_capabilities (
  pack_id TEXT NOT NULL REFERENCES context_packs(id),
  capability TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN (${effects})),
  source_ref TEXT,
  PRIMARY KEY (pack_id, capability)
);
CREATE TABLE IF NOT EXISTS ${EXECUTION_PROFILES_TABLE} (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  adapter_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  variant TEXT,
  adapter_config_json TEXT NOT NULL,
  observation_interval_ms INTEGER NOT NULL CHECK (observation_interval_ms > 0),
  no_progress_timeout_ms INTEGER NOT NULL CHECK (no_progress_timeout_ms > 0),
  cancellation_grace_ms INTEGER NOT NULL CHECK (cancellation_grace_ms > 0),
  ${MAX_RUN_DURATION_COLUMN} INTEGER CHECK (${MAX_RUN_DURATION_COLUMN} > 0),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  UNIQUE (role_id, id)
);
CREATE TABLE IF NOT EXISTS execution_profile_tools (
  profile_id TEXT NOT NULL REFERENCES ${EXECUTION_PROFILES_TABLE}(id),
  tool_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  PRIMARY KEY (profile_id, tool_id)
);
CREATE TABLE IF NOT EXISTS ${RUN_SPECS_TABLE} (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  phase TEXT NOT NULL,
  task_ref TEXT NOT NULL,
  dispatch_ref TEXT NOT NULL,
  work_definition_ref TEXT,
  work_definition_id TEXT,
  work_definition_version INTEGER,
  work_definition_digest TEXT,
  workflow_effect_id TEXT REFERENCES workflow_effects(id),
  input_artifact_id TEXT REFERENCES workflow_artifacts(id),
  context_pack_id TEXT NOT NULL REFERENCES context_packs(id),
  execution_profile_id TEXT NOT NULL REFERENCES ${EXECUTION_PROFILES_TABLE}(id),
  execution_profile_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  references_json TEXT NOT NULL,
  requested_capabilities_json TEXT NOT NULL,
  output_contract_ref TEXT NOT NULL,
  no_progress_timeout_ms INTEGER NOT NULL,
  cancellation_grace_ms INTEGER NOT NULL,
  ${MAX_RUN_DURATION_COLUMN} INTEGER CHECK (${MAX_RUN_DURATION_COLUMN} > 0),
  spec_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  ${RUN_SPEC_RETRY_OF_COLUMN} TEXT REFERENCES ${RUN_SPECS_TABLE}(id)
);
CREATE TABLE IF NOT EXISTS run_dispatches (
  dispatch_ref TEXT NOT NULL,
  role_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  task_ref TEXT NOT NULL,
  run_spec_id TEXT NOT NULL UNIQUE REFERENCES run_specs(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (dispatch_ref, role_id, phase)
);
CREATE TABLE IF NOT EXISTS dispatch_intents (
  id TEXT PRIMARY KEY,
  run_spec_id TEXT NOT NULL REFERENCES run_specs(id),
  operation_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('committed', 'consumed', 'blocked')),
  detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gateway_sessions (
  run_spec_id TEXT PRIMARY KEY REFERENCES run_specs(id),
  create_intent_id TEXT NOT NULL UNIQUE REFERENCES dispatch_intents(id),
  adapter_session_id TEXT NOT NULL UNIQUE,
  profile_digest TEXT NOT NULL,
  session_receipt_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gateway_turns (
  run_spec_id TEXT NOT NULL REFERENCES run_specs(id),
  turn_sequence INTEGER NOT NULL CHECK (turn_sequence > 0),
  submit_intent_id TEXT NOT NULL UNIQUE REFERENCES dispatch_intents(id),
  adapter_session_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  submission_receipt_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_spec_id, turn_sequence)
);
CREATE TABLE IF NOT EXISTS gateway_run_state (
  run_spec_id TEXT PRIMARY KEY REFERENCES run_specs(id),
  adapter_session_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('observing', 'completed', 'failed', 'cancelled', 'timed-out', 'policy-blocked', 'output-invalid')),
  progress_token TEXT NOT NULL,
  observed_tool_ids_json TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  last_progress_at TEXT NOT NULL,
  terminal_at TEXT,
  output_json TEXT,
  output_digest TEXT,
  observation_receipt_json TEXT,
  cancellation_receipt_json TEXT,
  detail TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gateway_run_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  run_spec_id TEXT NOT NULL REFERENCES run_specs(id),
  status TEXT NOT NULL,
  progress_token TEXT NOT NULL,
  observed_tool_ids_json TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifact_contracts (
  ref TEXT PRIMARY KEY,
  schema_json TEXT NOT NULL,
  schema_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifact_contract_metadata (
  contract_ref TEXT PRIMARY KEY REFERENCES artifact_contracts(ref),
  metadata_schema_ref TEXT NOT NULL REFERENCES artifact_contracts(ref),
  metadata_json TEXT NOT NULL,
  metadata_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS protocol_shared_schemas (
  contract_ref TEXT PRIMARY KEY REFERENCES artifact_contracts(ref),
  ordinal INTEGER NOT NULL UNIQUE CHECK (ordinal >= 0)
);
CREATE TABLE IF NOT EXISTS protocol_work_packets (
  id TEXT PRIMARY KEY,
  source_digest TEXT NOT NULL,
  packet_json TEXT NOT NULL,
  packet_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS protocol_proposals (
  id TEXT PRIMARY KEY,
  work_packet_id TEXT NOT NULL REFERENCES protocol_work_packets(id),
  proposal_json TEXT NOT NULL,
  proposal_digest TEXT NOT NULL,
  valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
  violations_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('evaluated', 'approved', 'rejected', 'applied')),
  created_at TEXT NOT NULL,
  UNIQUE (work_packet_id, proposal_digest)
);
CREATE TABLE IF NOT EXISTS protocol_proposal_batches (
  id TEXT PRIMARY KEY,
  work_packet_id TEXT NOT NULL REFERENCES protocol_work_packets(id),
  assigned_refs_json TEXT NOT NULL,
  batch_json TEXT NOT NULL,
  batch_digest TEXT NOT NULL UNIQUE,
  author_session_id TEXT NOT NULL,
  valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
  violations_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS protocol_proposal_reviews (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES protocol_proposals(id),
  review_json TEXT NOT NULL,
  review_digest TEXT NOT NULL UNIQUE,
  verdict TEXT NOT NULL CHECK (verdict IN ('PASS', 'FAIL')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifact_contract_activations (
  contract_ref TEXT PRIMARY KEY REFERENCES artifact_contracts(ref),
  proposal_id TEXT NOT NULL REFERENCES protocol_proposals(id),
  fragment_digest TEXT NOT NULL,
  activated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS protocol_reconciliation_proposals (
  id TEXT PRIMARY KEY,
  work_packet_id TEXT NOT NULL REFERENCES protocol_work_packets(id),
  proposal_json TEXT NOT NULL,
  proposal_digest TEXT NOT NULL UNIQUE,
  valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
  violations_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('evaluated', 'approved', 'rejected', 'applied')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS protocol_reconciliation_reviews (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES protocol_reconciliation_proposals(id),
  review_json TEXT NOT NULL,
  review_digest TEXT NOT NULL UNIQUE,
  verdict TEXT NOT NULL CHECK (verdict IN ('PASS', 'FAIL')),
  created_at TEXT NOT NULL
);
`;
