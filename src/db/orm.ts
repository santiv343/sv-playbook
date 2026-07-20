import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { STORE_SCHEMA } from './orm.constants.js';
import type { StoreOrm } from './orm.types.js';

// Único punto donde se instancia Drizzle sobre la conexión SQLite cruda.
// STORE_SCHEMA es la única fuente de verdad de tablas para el ORM — todo
// acceso a datos fuera de src/db/ debe pasar por store.orm (nunca SQL crudo
// directo), mecanizado por un gate de lint.
export function createStoreOrm(database: Database.Database): StoreOrm {
  return drizzle(database, { schema: STORE_SCHEMA });
}
