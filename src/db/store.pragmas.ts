import type Database from 'better-sqlite3';
import { numberColumn } from './rows.js';
import { DATABASE_COLUMN } from './schema-vocabulary.constants.js';
import { STORE_PRAGMA } from './store.pragmas.constants.js';

export function applyExclusiveStorePragmas(db: Database.Database): void {
  db.exec(STORE_PRAGMA.BUSY_TIMEOUT);
  db.exec(STORE_PRAGMA.JOURNAL_MODE_WAL);
  db.exec(STORE_PRAGMA.FOREIGN_KEYS_ON);
  db.exec(STORE_PRAGMA.LOCKING_EXCLUSIVE);
}

export function applyReadOnlyStorePragmas(db: Database.Database): void {
  db.exec(STORE_PRAGMA.BUSY_TIMEOUT);
  db.exec(STORE_PRAGMA.FOREIGN_KEYS_ON);
  db.exec(STORE_PRAGMA.QUERY_ONLY_ON);
  db.exec(STORE_PRAGMA.LOCKING_NORMAL);
}

export function readStoreSchemaVersion(db: Database.Database): number {
  return numberColumn(db.prepare(STORE_PRAGMA.USER_VERSION).get(), DATABASE_COLUMN.USER_VERSION);
}
