import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { STORE_SCHEMA } from './orm.constants.js';

// El tipo real de `store.orm` en todo el codebase — parametrizado por
// STORE_SCHEMA, así Drizzle infiere los tipos de columna correctos en cada
// `.select()/.insert()` sin tener que anotar manualmente.
export type StoreOrm = BetterSQLite3Database<typeof STORE_SCHEMA>;
