export const MODEL_CAPABILITY_EVALUATION_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS model_capability_evaluations (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  suite_digest TEXT NOT NULL,
  capability_id TEXT NOT NULL REFERENCES model_capabilities(id),
  profile_id TEXT NOT NULL REFERENCES execution_profiles(id),
  adapter_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  variant TEXT,
  adapter_profile_digest TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  receipt_digest TEXT NOT NULL UNIQUE,
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  assessed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS model_capability_evaluations_immutable_update
BEFORE UPDATE ON model_capability_evaluations
BEGIN
  SELECT RAISE(ABORT, 'model capability evaluations are immutable');
END;
CREATE TRIGGER IF NOT EXISTS model_capability_evaluations_immutable_delete
BEFORE DELETE ON model_capability_evaluations
BEGIN
  SELECT RAISE(ABORT, 'model capability evaluations are immutable');
END;
`;
