import type Database from 'better-sqlite3';
import { ROLE_CATALOG_STORE_SCHEMA } from './role-catalog.schema.constants.js';

export function addVersionedRoleCatalog(db: Database.Database): void {
  db.exec(ROLE_CATALOG_STORE_SCHEMA);
}
