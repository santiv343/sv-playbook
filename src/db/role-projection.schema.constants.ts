// El doble UNIQUE en role_projection_receipts es lo que sostiene la
// idempotencia de recordRoleProjectionReceipts (role-projection-receipt.ts):
// (adapter_id, id) es la PK lógica del receipt; (adapter_id, catalogVersion,
// catalogDigest, profileDigest, artifactDigest) es la identidad de
// CONTENIDO — dos proyecciones con exactamente los mismos 5 valores
// reutilizan el mismo receipt en vez de crear uno nuevo. role_projection_activation
// es la única tabla mutable de las dos: apunta a cuál receipt es el
// vigente ahora, receipts en sí son inmutables (triggers ABORT).
export const ROLE_PROJECTION_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS role_projection_receipts (
  id TEXT PRIMARY KEY,
  adapter_id TEXT NOT NULL,
  catalog_version INTEGER NOT NULL,
  catalog_digest TEXT NOT NULL,
  profile_digest TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (adapter_id, id),
  UNIQUE (adapter_id, catalog_version, catalog_digest, profile_digest, artifact_digest),
  FOREIGN KEY (catalog_version, catalog_digest)
    REFERENCES role_catalog_versions(version, catalog_digest)
);
CREATE TABLE IF NOT EXISTS role_projection_activation (
  adapter_id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  FOREIGN KEY (adapter_id, receipt_id)
    REFERENCES role_projection_receipts(adapter_id, id)
);
CREATE TRIGGER IF NOT EXISTS role_projection_receipts_immutable_update
BEFORE UPDATE ON role_projection_receipts
BEGIN
  SELECT RAISE(ABORT, 'role projection receipts are immutable');
END;
CREATE TRIGGER IF NOT EXISTS role_projection_receipts_immutable_delete
BEFORE DELETE ON role_projection_receipts
BEGIN
  SELECT RAISE(ABORT, 'role projection receipts are immutable');
END;
`;
