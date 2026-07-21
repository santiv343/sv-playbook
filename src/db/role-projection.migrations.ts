import type Database from 'better-sqlite3';
import { ROLE_PROJECTION_STORE_SCHEMA } from './role-projection.schema.constants.js';

// Migración de tabla nueva, idempotente vía CREATE TABLE IF NOT EXISTS.
export function addRoleProjectionReceipts(db: Database.Database): void {
  db.exec(ROLE_PROJECTION_STORE_SCHEMA);
}
