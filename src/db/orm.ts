import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { STORE_SCHEMA } from './orm.constants.js';
import type { StoreOrm } from './orm.types.js';

export function createStoreOrm(database: Database.Database): StoreOrm {
  return drizzle(database, { schema: STORE_SCHEMA });
}
