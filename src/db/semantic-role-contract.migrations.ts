import type Database from 'better-sqlite3';
import { SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';
import {
  ROLE_CAPABILITY_REQUEST_CLASS_STORE_SCHEMA,
  ROLE_CATALOG_PROFILE_STORE_SCHEMA,
} from './role-catalog.schema.constants.js';

export function addSemanticRoleContractFields(db: Database.Database): void {
  migrateTableColumn(db, 'role_contracts', 'definition_version', 'INTEGER', true, '1');
  migrateTableColumn(db, 'role_contracts', 'mission', SQLITE_COLUMN_TYPE.TEXT, true, "''");
  db.exec(`${ROLE_CAPABILITY_REQUEST_CLASS_STORE_SCHEMA}\n${ROLE_CATALOG_PROFILE_STORE_SCHEMA}`);
}
