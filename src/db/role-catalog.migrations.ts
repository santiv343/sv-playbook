import type Database from 'better-sqlite3';
import { ROLE_CATALOG_STORE_SCHEMA } from './role-catalog.schema.constants.js';

// Migración de tabla NUEVA (no ADD COLUMN) — sólo ejecuta el CREATE TABLE
// IF NOT EXISTS completo del schema; el "IF NOT EXISTS" es lo que la hace
// idempotente acá, no un chequeo explícito como en migrateTableColumn.
export function addVersionedRoleCatalog(db: Database.Database): void {
  db.exec(ROLE_CATALOG_STORE_SCHEMA);
}
