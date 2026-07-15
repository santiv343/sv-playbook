export const REVIEW_CANDIDATE_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS responsibility_input_policies (
  responsibility_id TEXT PRIMARY KEY REFERENCES responsibilities(id),
  phase TEXT NOT NULL,
  required_status TEXT NOT NULL,
  contract_ref TEXT NOT NULL REFERENCES artifact_contracts(ref),
  source_kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_candidates (
  id TEXT PRIMARY KEY,
  packet_id TEXT NOT NULL REFERENCES packets(id),
  work_definition_version INTEGER NOT NULL,
  work_definition_digest TEXT NOT NULL,
  candidate_sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  producer_session_id TEXT NOT NULL REFERENCES sessions(id),
  artifact_id TEXT NOT NULL UNIQUE REFERENCES workflow_artifacts(id),
  created_at TEXT NOT NULL,
  UNIQUE (packet_id, work_definition_version, candidate_sha),
  FOREIGN KEY (packet_id, work_definition_version)
    REFERENCES packet_definitions(packet_id, version)
);
CREATE TRIGGER IF NOT EXISTS review_candidates_immutable_update
BEFORE UPDATE ON review_candidates BEGIN
  SELECT RAISE(ABORT, 'review candidates are immutable');
END;
CREATE TRIGGER IF NOT EXISTS review_candidates_immutable_delete
BEFORE DELETE ON review_candidates BEGIN
  SELECT RAISE(ABORT, 'review candidates are immutable');
END;
CREATE TRIGGER IF NOT EXISTS workflow_artifacts_immutable_update
BEFORE UPDATE ON workflow_artifacts BEGIN
  SELECT RAISE(ABORT, 'workflow artifacts are immutable');
END;
CREATE TRIGGER IF NOT EXISTS workflow_artifacts_immutable_delete
BEFORE DELETE ON workflow_artifacts BEGIN
  SELECT RAISE(ABORT, 'workflow artifacts are immutable');
END;
`;
