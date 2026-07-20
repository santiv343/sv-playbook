import type Database from 'better-sqlite3';
import { DATABASE_COLUMN, DATABASE_TABLE, SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';
import { migrateTableColumn } from './store.migration-helpers.js';

// Ata `decisions` a un packet + versión puntual de work definition (ver
// checkpoint-gate.ts: answeredAgainstVersion es lo que detecta si una
// respuesta quedó "vieja" tras un amend). migrateTableColumn (ver su
// comentario) es idempotente, así esta migración es segura de re-correr.
export function addDecisionLinkage(db: Database.Database): void {
  migrateTableColumn(db, DATABASE_TABLE.DECISIONS, DATABASE_COLUMN.PACKET_ID, SQLITE_COLUMN_TYPE.TEXT, false);
  migrateTableColumn(db, DATABASE_TABLE.DECISIONS, DATABASE_COLUMN.ANSWERED_AGAINST_VERSION, SQLITE_COLUMN_TYPE.INTEGER, false);
}
