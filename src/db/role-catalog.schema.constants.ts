import { ROLE_CATALOG_PROFILE_SOURCE } from '../roles/catalog.constants.js';
import { RESPONSIBILITY_CLASSIFICATION, SELF_CORRECTION_MODE } from '../roles/role.constants.js';

export const ROLE_CAPABILITY_REQUEST_CLASS_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS role_capability_request_classes (
  role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  capability_class TEXT NOT NULL,
  PRIMARY KEY (role_id, capability_class)
);
`;

export const ROLE_CATALOG_PROFILE_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS role_catalog_profile (
  profile_key TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  entry_role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('${ROLE_CATALOG_PROFILE_SOURCE.BUNDLED}', '${ROLE_CATALOG_PROFILE_SOURCE.CUSTOM}'))
);
CREATE TABLE IF NOT EXISTS role_catalog_bootstrap_receipts (
  bootstrap_key TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  profile_digest TEXT NOT NULL,
  catalog_version INTEGER NOT NULL,
  catalog_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (catalog_version, catalog_digest)
    REFERENCES role_catalog_versions(version, catalog_digest)
);
CREATE TRIGGER IF NOT EXISTS role_catalog_bootstrap_receipts_immutable_update
BEFORE UPDATE ON role_catalog_bootstrap_receipts
BEGIN
  SELECT RAISE(ABORT, 'role catalog bootstrap receipts are immutable');
END;
CREATE TRIGGER IF NOT EXISTS role_catalog_bootstrap_receipts_immutable_delete
BEFORE DELETE ON role_catalog_bootstrap_receipts
BEGIN
  SELECT RAISE(ABORT, 'role catalog bootstrap receipts are immutable');
END;
`;

export const ROLE_CATALOG_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS responsibilities (
  id TEXT PRIMARY KEY,
  classification TEXT NOT NULL CHECK (classification IN ('${RESPONSIBILITY_CLASSIFICATION.SEMANTIC}', '${RESPONSIBILITY_CLASSIFICATION.DETERMINISTIC}')),
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_responsibilities (
  responsibility_id TEXT PRIMARY KEY REFERENCES responsibilities(id)
);
CREATE TABLE IF NOT EXISTS role_contracts (
  role_id TEXT PRIMARY KEY,
  definition_version INTEGER NOT NULL CHECK (definition_version > 0),
  mission TEXT NOT NULL,
  context_item_id TEXT NOT NULL,
  context_item_version INTEGER NOT NULL,
  input_contract_ref TEXT NOT NULL,
  output_contract_ref TEXT NOT NULL,
  minimum_model_capability TEXT NOT NULL,
  UNIQUE (context_item_id, context_item_version),
  FOREIGN KEY (context_item_id, context_item_version) REFERENCES context_items(id, version)
);
CREATE TABLE IF NOT EXISTS role_responsibilities (
  role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  responsibility_id TEXT NOT NULL UNIQUE REFERENCES responsibilities(id),
  PRIMARY KEY (role_id, responsibility_id)
);
${ROLE_CAPABILITY_REQUEST_CLASS_STORE_SCHEMA}
CREATE TABLE IF NOT EXISTS role_handoffs (
  source_role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  target_role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  artifact_contract_ref TEXT NOT NULL,
  PRIMARY KEY (source_role_id, target_role_id, artifact_contract_ref)
);
CREATE TABLE IF NOT EXISTS model_capabilities (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS required_roles (
  role_id TEXT PRIMARY KEY REFERENCES role_contracts(role_id)
);
CREATE TABLE IF NOT EXISTS role_prohibitions (
  role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  operation_id TEXT NOT NULL,
  PRIMARY KEY (role_id, operation_id)
);
CREATE TABLE IF NOT EXISTS role_policy_declarations (
  role_id TEXT PRIMARY KEY REFERENCES role_contracts(role_id),
  self_correction_mode TEXT NOT NULL CHECK (self_correction_mode IN ('${SELF_CORRECTION_MODE.NONE}', '${SELF_CORRECTION_MODE.BOUNDED}'))
);
CREATE TABLE IF NOT EXISTS role_self_correction_scopes (
  role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  output_class TEXT NOT NULL,
  PRIMARY KEY (role_id, output_class)
);
CREATE TABLE IF NOT EXISTS role_stop_conditions (
  role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  condition_id TEXT NOT NULL,
  PRIMARY KEY (role_id, condition_id)
);
CREATE TABLE IF NOT EXISTS role_escalation_classes (
  role_id TEXT NOT NULL REFERENCES role_contracts(role_id),
  class_id TEXT NOT NULL,
  PRIMARY KEY (role_id, class_id)
);
CREATE TABLE IF NOT EXISTS role_catalog_versions (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  definition_json TEXT NOT NULL,
  catalog_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE (version, catalog_digest)
);
CREATE TABLE IF NOT EXISTS role_catalog_activation (
  activation_key TEXT PRIMARY KEY,
  catalog_version INTEGER NOT NULL,
  catalog_digest TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  FOREIGN KEY (catalog_version, catalog_digest)
    REFERENCES role_catalog_versions(version, catalog_digest)
);
${ROLE_CATALOG_PROFILE_STORE_SCHEMA}
CREATE TRIGGER IF NOT EXISTS role_catalog_versions_immutable_update
BEFORE UPDATE ON role_catalog_versions
BEGIN
  SELECT RAISE(ABORT, 'role catalog versions are immutable');
END;
CREATE TRIGGER IF NOT EXISTS role_catalog_versions_immutable_delete
BEFORE DELETE ON role_catalog_versions
BEGIN
  SELECT RAISE(ABORT, 'role catalog versions are immutable');
END;
CREATE TABLE IF NOT EXISTS model_capability_evidence (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  variant TEXT,
  capability_id TEXT NOT NULL REFERENCES model_capabilities(id),
  evidence_ref TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (provider_id, model_id, variant, capability_id, evidence_digest)
);
CREATE TRIGGER IF NOT EXISTS model_capability_evidence_immutable_update
BEFORE UPDATE ON model_capability_evidence
BEGIN
  SELECT RAISE(ABORT, 'model capability evidence is immutable');
END;
CREATE TRIGGER IF NOT EXISTS model_capability_evidence_immutable_delete
BEFORE DELETE ON model_capability_evidence
BEGIN
  SELECT RAISE(ABORT, 'model capability evidence is immutable');
END;
`;
