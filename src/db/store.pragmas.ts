import type Database from 'better-sqlite3';
import { numberColumn } from './rows.js';
import { DATABASE_COLUMN } from './schema-vocabulary.constants.js';
import { STORE_PRAGMA } from './store.pragmas.constants.js';

// Pragmas para el escritor único (ver store.ts, flujo 2):
// LOCKING_EXCLUSIVE toma el lock del archivo apenas se abre (no espera a
// la primera escritura), WAL permite lectores concurrentes sin bloquear
// al escritor, FOREIGN_KEYS_ON hace que las FKs se verifiquen de verdad
// (SQLite las ignora por default si no se pide explícitamente).
export function applyExclusiveStorePragmas(db: Database.Database): void {
  db.exec(STORE_PRAGMA.BUSY_TIMEOUT);
  db.exec(STORE_PRAGMA.JOURNAL_MODE_WAL);
  db.exec(STORE_PRAGMA.FOREIGN_KEYS_ON);
  db.exec(STORE_PRAGMA.LOCKING_EXCLUSIVE);
}

// LOCKING_NORMAL (no exclusivo) + QUERY_ONLY_ON: esta conexión ni pelea
// por el lock de escritura ni puede escribir aunque alguien lo intentara
// por error — doble garantía de que openStoreReadOnly() (flujo 2) es
// realmente de sólo lectura, no sólo "por convención".
export function applyReadOnlyStorePragmas(db: Database.Database): void {
  db.exec(STORE_PRAGMA.BUSY_TIMEOUT);
  db.exec(STORE_PRAGMA.FOREIGN_KEYS_ON);
  db.exec(STORE_PRAGMA.QUERY_ONLY_ON);
  db.exec(STORE_PRAGMA.LOCKING_NORMAL);
}

export function readStoreSchemaVersion(db: Database.Database): number {
  return numberColumn(db.prepare(STORE_PRAGMA.USER_VERSION).get(), DATABASE_COLUMN.USER_VERSION);
}
