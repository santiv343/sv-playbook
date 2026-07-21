import type Database from 'better-sqlite3';
import { SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';
import {
  ROLE_CAPABILITY_REQUEST_CLASS_STORE_SCHEMA,
  ROLE_CATALOG_PROFILE_STORE_SCHEMA,
} from './role-catalog.schema.constants.js';

// Mezcla ADD COLUMN (definition_version/mission con defaults para filas
// existentes) con CREATE TABLE de dos tablas nuevas en una sola migración —
// agrupadas porque conceptualmente son un mismo cambio: hacer que
// role_contracts tenga versión/misión propias en vez de vivir sólo en el
// context item asociado.
export function addSemanticRoleContractFields(db: Database.Database): void {
  migrateTableColumn(db, 'role_contracts', 'definition_version', SQLITE_COLUMN_TYPE.INTEGER, true, '1');
  migrateTableColumn(db, 'role_contracts', 'mission', SQLITE_COLUMN_TYPE.TEXT, true, "''");
  db.exec(`${ROLE_CAPABILITY_REQUEST_CLASS_STORE_SCHEMA}\n${ROLE_CATALOG_PROFILE_STORE_SCHEMA}`);
}
